import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

// A skipped real-DB suite is a silent coverage hole in CI, so fail loudly.
if (process.env.CI && !testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required to run the payments schema DB tests in CI");
}

function assertTestDatabase(connectionString: string): void {
  let databaseName: string;

  try {
    databaseName = decodeURIComponent(new URL(connectionString).pathname);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a valid PostgreSQL URL");
  }

  if (!databaseName.includes("_test")) {
    throw new Error(
      'DATABASE_URL_TEST must point to a database whose name contains "_test"; refusing to migrate and truncate it',
    );
  }
}

if (testDatabaseUrl) {
  assertTestDatabase(testDatabaseUrl);
}

const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type DbClientModule = typeof import("../db/client.js");

let dbClient!: DbClientModule;
let fixtureCounter = 0;

type Fixture = {
  buyerId: number;
  buyerPhone: string;
  sellerId: number;
  shopId: number;
  orderId: number;
};

type PaymentOverrides = {
  orderId?: number;
  status?: "pending" | "succeeded" | "canceled" | "failed" | "manual_review";
  amountKopecks?: number;
  currency?: string;
  idempotencyKey?: string;
  providerPaymentId?: string | null;
  reconcileAttempts?: number;
};

function pool() {
  return dbClient.requirePool();
}

function nextPhone(): string {
  fixtureCounter += 1;
  return ["+7", "999", String(fixtureCounter).padStart(7, "0")].join("");
}

function nextSlug(): string {
  fixtureCounter += 1;
  return `payments-schema-${fixtureCounter}`;
}

async function createSeller(): Promise<number> {
  const result = await pool().query<{ id: number }>(
    "INSERT INTO sellers (display_name) VALUES ($1) RETURNING id",
    [`Тестовый продавец ${fixtureCounter}`],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test seller");
  }
  return id;
}

async function createOrder(fixture: Fixture): Promise<number> {
  const result = await pool().query<{ id: number }>(
    `INSERT INTO orders (buyer_user_id, shop_id, total_kopecks, buyer_phone, client_checkout_id)
     VALUES ($1, $2, 420000, $3, $4)
     RETURNING id`,
    [fixture.buyerId, fixture.shopId, fixture.buyerPhone, randomUUID()],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test order");
  }
  return id;
}

async function createFixture(): Promise<Fixture> {
  const buyerPhone = nextPhone();
  const buyer = await pool().query<{ id: number }>(
    "INSERT INTO users (phone) VALUES ($1) RETURNING id",
    [buyerPhone],
  );
  const buyerId = buyer.rows[0]?.id;
  if (!buyerId) {
    throw new Error("failed to insert a test buyer");
  }

  const sellerId = await createSeller();
  const shop = await pool().query<{ id: number }>(
    "INSERT INTO shops (seller_id, slug, name) VALUES ($1, $2, $3) RETURNING id",
    [sellerId, nextSlug(), "Тестовый магазин"],
  );
  const shopId = shop.rows[0]?.id;
  if (!shopId) {
    throw new Error("failed to insert a test shop");
  }

  const fixture = { buyerId, buyerPhone, sellerId, shopId, orderId: 0 };
  fixture.orderId = await createOrder(fixture);
  return fixture;
}

async function createAccount(
  sellerId: number,
  status?: "active" | "error" | "superseded" | "disabled",
): Promise<number> {
  const base =
    "INSERT INTO seller_payment_accounts (seller_id, provider, provider_account_id, is_test, token_ciphertext, token_key_version";
  const values = "VALUES ($1, 'fake', $2, true, $3::bytea, 1";
  const returning = "RETURNING id";

  const result = await pool().query<{ id: number }>(
    status === undefined
      ? `${base}) ${values}) ${returning}`
      : `${base}, status) ${values}, $4) ${returning}`,
    status === undefined
      ? [sellerId, randomUUID(), Buffer.from([0])]
      : [sellerId, randomUUID(), Buffer.from([0]), status],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test payment account");
  }
  return id;
}

async function insertPayment(
  fixture: Fixture,
  accountId: number,
  overrides: PaymentOverrides = {},
): Promise<number> {
  const result = await pool().query<{ id: number }>(
    `INSERT INTO payments
       (order_id, seller_account_id, provider, status, amount_kopecks, currency,
        idempotency_key, provider_payment_id, reconcile_attempts)
     VALUES ($1, $2, 'fake', $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      overrides.orderId ?? fixture.orderId,
      accountId,
      overrides.status ?? "pending",
      overrides.amountKopecks ?? 420_000,
      overrides.currency ?? "RUB",
      overrides.idempotencyKey ?? randomUUID(),
      overrides.providerPaymentId ?? null,
      overrides.reconcileAttempts ?? 0,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test payment");
  }
  return id;
}

async function expectDbError(
  promise: Promise<unknown>,
  code: string,
  constraint: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code, constraint });
}

describeWithDb("payments schema with a real database", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });
  });

  afterAll(async () => {
    await dbClient?.requirePool().end();
  });

  beforeEach(async () => {
    fixtureCounter = 0;
    await pool().query(
      "TRUNCATE TABLE payments, seller_payment_accounts, order_items, orders, products, shops, sellers, users, otp_codes CASCADE",
    );
  });

  it("defaults a new seller account to error (fail-closed)", async () => {
    const fixture = await createFixture();
    const accountId = await createAccount(fixture.sellerId);

    const result = await pool().query<{ status: string }>(
      "SELECT status FROM seller_payment_accounts WHERE id = $1",
      [accountId],
    );
    expect(result.rows[0]?.status).toBe("error");
  });

  it("allows only one active account per seller", async () => {
    const fixture = await createFixture();
    await createAccount(fixture.sellerId, "active");

    await expectDbError(
      createAccount(fixture.sellerId, "active"),
      "23505",
      "seller_payment_accounts_seller_id_active_unique",
    );
  });

  it("allows only one pending or manual_review payment per order", async () => {
    const fixture = await createFixture();
    const accountId = await createAccount(fixture.sellerId, "active");
    await insertPayment(fixture, accountId);

    await expectDbError(
      insertPayment(fixture, accountId),
      "23505",
      "payments_order_id_active_unique",
    );
    await expectDbError(
      insertPayment(fixture, accountId, { status: "manual_review" }),
      "23505",
      "payments_order_id_active_unique",
    );
  });

  it("rejects a duplicate provider payment id across orders", async () => {
    const fixture = await createFixture();
    const accountId = await createAccount(fixture.sellerId, "active");
    const secondOrderId = await createOrder(fixture);
    const providerPaymentId = `fake_${randomUUID()}`;

    await insertPayment(fixture, accountId, {
      status: "succeeded",
      providerPaymentId,
    });
    await expectDbError(
      insertPayment(fixture, accountId, {
        orderId: secondOrderId,
        status: "succeeded",
        providerPaymentId,
      }),
      "23505",
      "payments_provider_payment_id_unique",
    );
  });

  it("rejects a duplicate idempotency key for the same order", async () => {
    const fixture = await createFixture();
    const accountId = await createAccount(fixture.sellerId, "active");
    const idempotencyKey = randomUUID();

    await insertPayment(fixture, accountId, { status: "succeeded", idempotencyKey });
    await expectDbError(
      insertPayment(fixture, accountId, { status: "failed", idempotencyKey }),
      "23505",
      "payments_order_id_idempotency_key_unique",
    );
  });

  it("rejects negative amounts, non-RUB currency and negative reconcile attempts", async () => {
    const fixture = await createFixture();
    const accountId = await createAccount(fixture.sellerId, "active");

    await expectDbError(
      insertPayment(fixture, accountId, { amountKopecks: -1 }),
      "23514",
      "payments_amount_kopecks_check",
    );
    await expectDbError(
      insertPayment(fixture, accountId, { currency: "USD" }),
      "23514",
      "payments_currency_check",
    );
    await expectDbError(
      insertPayment(fixture, accountId, { reconcileAttempts: -1 }),
      "23514",
      "payments_reconcile_attempts_check",
    );
  });

  it("defaults reconcile fields without an explicit value and creates the pending index", async () => {
    const fixture = await createFixture();
    const accountId = await createAccount(fixture.sellerId, "active");

    // Deliberately omit reconcile_attempts/last_checked_at: this asserts the
    // database defaults, not a value supplied by the application.
    const inserted = await pool().query<{ id: number }>(
      `INSERT INTO payments
         (order_id, seller_account_id, provider, status, amount_kopecks, currency, idempotency_key)
       VALUES ($1, $2, 'fake', 'pending', 420000, 'RUB', $3)
       RETURNING id`,
      [fixture.orderId, accountId, randomUUID()],
    );
    const paymentId = inserted.rows[0]?.id;
    if (!paymentId) {
      throw new Error("failed to insert a test payment without reconcile fields");
    }

    const row = await pool().query<{
      reconcile_attempts: number;
      last_checked_at: Date | null;
    }>("SELECT reconcile_attempts, last_checked_at FROM payments WHERE id = $1", [paymentId]);
    expect(row.rows[0]?.reconcile_attempts).toBe(0);
    expect(row.rows[0]?.last_checked_at).toBeNull();

    const index = await pool().query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'payments'
         AND indexname = 'payments_pending_reconcile_idx'`,
    );
    expect(index.rows[0]?.indexdef).toContain("status");
    expect(index.rows[0]?.indexdef).toContain("pending");
  });

  it("enforces restrict deletes for order, payment account and seller", async () => {
    const fixture = await createFixture();
    const accountId = await createAccount(fixture.sellerId, "active");
    await insertPayment(fixture, accountId);

    await expectDbError(
      pool().query("DELETE FROM orders WHERE id = $1", [fixture.orderId]),
      "23001",
      "payments_order_id_orders_id_fk",
    );
    await expectDbError(
      pool().query("DELETE FROM seller_payment_accounts WHERE id = $1", [accountId]),
      "23001",
      "payments_seller_account_id_seller_payment_accounts_id_fk",
    );

    // A seller without a shop isolates the seller FK from the shop/order cascade.
    const sellerId = await createSeller();
    await createAccount(sellerId, "active");
    await expectDbError(
      pool().query("DELETE FROM sellers WHERE id = $1", [sellerId]),
      "23001",
      "seller_payment_accounts_seller_id_sellers_id_fk",
    );
  });
});
