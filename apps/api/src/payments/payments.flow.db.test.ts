import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";
import { PaymentProviderError } from "../payments/errors.js";
import { FakePaymentProvider } from "../payments/fake-provider.js";
import type {
  CreateProviderPaymentInput,
  CreateProviderPaymentResult,
  ProviderPayment,
} from "../payments/provider.js";

/**
 * End-to-end API flow on the fake provider: seller OAuth account -> create
 * payment -> fake complete -> webhook -> order paid, plus replay, authz,
 * provider failures, race, disconnect and reconcile orphans. The fake
 * provider instance lives on `app.payments`; a route never constructs its own.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (process.env.CI && !testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required to run the payments flow DB tests in CI");
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

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");
type ReconcileModule = typeof import("../payments/payments.reconcile.js");

let appModule!: AppModule;
let app!: ReturnType<AppModule["buildApp"]>;
let dbClient!: DbClientModule;
let reconcileModule!: ReconcileModule;

function phone(): string {
  fixtureCounter += 1;
  return ["+7", "999", String(fixtureCounter).padStart(7, "0")].join("");
}

let fixtureCounter = 10_000;

function pool() {
  return dbClient.requirePool();
}

type TestUser = { id: number; phone: string; cookie: string };

async function createUser(): Promise<TestUser> {
  const phoneNumber = phone();
  const result = await pool().query<{ id: number }>(
    "INSERT INTO users (phone) VALUES ($1) RETURNING id",
    [phoneNumber],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test user");
  }
  return { id, phone: phoneNumber, cookie: `${SESSION_COOKIE_NAME}=${app.jwt.sign({ sub: id })}` };
}

type TestSeller = TestUser & { sellerId: number; shopId: number };

async function createSeller(): Promise<TestSeller> {
  const user = await createUser();
  fixtureCounter += 1;
  const seller = await pool().query<{ id: number }>(
    "INSERT INTO sellers (display_name, user_id) VALUES ($1, $2) RETURNING id",
    [`Тестовый продавец ${fixtureCounter}`, user.id],
  );
  const sellerId = seller.rows[0]?.id;
  if (!sellerId) {
    throw new Error("failed to insert a test seller");
  }
  fixtureCounter += 1;
  const shop = await pool().query<{ id: number }>(
    "INSERT INTO shops (seller_id, slug, name, status) VALUES ($1, $2, $3, 'published') RETURNING id",
    [sellerId, `payments-flow-${fixtureCounter}`, "Тестовый магазин"],
  );
  const shopId = shop.rows[0]?.id;
  if (!shopId) {
    throw new Error("failed to insert a test shop");
  }
  return { ...user, sellerId, shopId };
}

async function createOrder(
  buyerId: number,
  shopId: number,
  totalKopecks = 420_000,
  status: "new" | "payment_pending" | "paid" = "new",
): Promise<number> {
  const result = await pool().query<{ id: number }>(
    `INSERT INTO orders (buyer_user_id, shop_id, status, total_kopecks, buyer_phone, client_checkout_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [buyerId, shopId, status, totalKopecks, phone(), randomUUID()],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test order");
  }
  await pool().query(
    "INSERT INTO order_items (order_id, name, price_kopecks, quantity) VALUES ($1, $2, $3, 1)",
    [id, "Тестовая вещь", totalKopecks],
  );
  return id;
}

type TestApp = ReturnType<AppModule["buildApp"]>;

async function buildTestApp(
  provider?: FakePaymentProvider,
  options: { paymentProviderTimeoutMs?: number } = {},
): Promise<TestApp> {
  const instance = appModule.buildApp({
    ...(provider === undefined ? {} : { paymentProvider: provider }),
    ...(options.paymentProviderTimeoutMs === undefined
      ? {}
      : { paymentProviderTimeoutMs: options.paymentProviderTimeoutMs }),
    reconcile: false,
  });
  await instance.ready();
  return instance;
}

function request(
  target: TestApp,
  user: TestUser,
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return target.inject({
    method,
    url,
    headers: { cookie: user.cookie, ...headers },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

type AccountBody = {
  id: number;
  provider: string;
  providerAccountId: string;
  isTest: boolean;
  status: string;
};

async function connectAccount(
  target: TestApp,
  seller: TestSeller,
  options: { code?: string; state?: string } = {},
): Promise<AccountBody> {
  const start = await request(target, seller, "POST", "/seller/payments/connect");
  expect(start.statusCode).toBe(200);
  const consentUrl = start.json<{ consentUrl: string }>().consentUrl;
  const state = options.state ?? new URL(consentUrl).searchParams.get("state");
  if (!state) {
    throw new Error("consent URL did not contain a state");
  }

  const callback = await target.inject({
    method: "GET",
    url: `/seller/payments/callback?code=${encodeURIComponent(options.code ?? `code-${randomUUID()}`)}&state=${encodeURIComponent(state)}`,
    headers: { cookie: seller.cookie },
  });
  expect(callback.statusCode).toBe(200);
  return callback.json<{ account: AccountBody }>().account;
}

type PaymentBody = {
  id: number;
  status: string;
  amountKopecks: number;
  currency: string;
  confirmationUrl: string | null;
  createdAt: string;
  paidAt: string | null;
};

function newIdempotencyKey(): string {
  return randomUUID();
}

function createPayment(
  target: TestApp,
  buyer: TestUser,
  orderId: number,
  key = newIdempotencyKey(),
  headers: Record<string, string> = {},
) {
  return request(target, buyer, "POST", `/orders/${orderId}/payments`, undefined, {
    "idempotency-key": key,
    ...headers,
  });
}

function sendWebhook(target: TestApp, providerPaymentId: string, payload?: unknown) {
  return target.inject({
    method: "POST",
    url: "/payments/yookassa/webhook",
    payload: (payload ?? {
      type: "notification",
      event: "payment.succeeded",
      object: { id: providerPaymentId, status: "succeeded" },
    }) as Record<string, unknown>,
  });
}

async function paymentRow(paymentId: number) {
  const result = await pool().query<{
    id: number;
    order_id: number;
    status: string;
    provider_payment_id: string | null;
    confirmation_url: string | null;
    reconcile_attempts: number;
  }>(
    "SELECT id, order_id, status, provider_payment_id, confirmation_url, reconcile_attempts FROM payments WHERE id = $1",
    [paymentId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`payment ${paymentId} not found`);
  }
  return row;
}

async function orderStatus(orderId: number): Promise<string> {
  const result = await pool().query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [
    orderId,
  ]);
  return result.rows[0]?.status ?? "";
}

async function countPayments(orderId: number): Promise<number> {
  const result = await pool().query<{ count: number }>(
    "SELECT count(*)::int AS count FROM payments WHERE order_id = $1",
    [orderId],
  );
  return result.rows[0]?.count ?? 0;
}

async function countActivePayments(orderId: number): Promise<number> {
  const result = await pool().query<{ count: number }>(
    "SELECT count(*)::int AS count FROM payments WHERE order_id = $1 AND status IN ('pending', 'manual_review')",
    [orderId],
  );
  return result.rows[0]?.count ?? 0;
}

/** Advisory lock `order:{id}` held by any session right now. */
async function countOrderAdvisoryLocks(orderId: number): Promise<number> {
  const result = await pool().query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
    [`order:${orderId}`],
  );
  return result.rows[0]?.count ?? 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backdatePayment(paymentId: number, minutes: number): Promise<void> {
  await pool().query(
    `UPDATE payments SET created_at = now() - ($2 || ' minutes')::interval WHERE id = $1`,
    [paymentId, String(minutes)],
  );
}

async function completeFakePayment(
  target: TestApp,
  providerPaymentId: string,
  status: "succeeded" | "canceled" = "succeeded",
): Promise<void> {
  const runtime = target.payments;
  if (!(runtime?.provider instanceof FakePaymentProvider)) {
    throw new Error("expected the fake provider on the test app");
  }
  runtime.provider.completePayment(providerPaymentId, status);
}

type CreateFailure = "none" | "unavailable" | "invalid_request" | "unauthorized";

/** Test double that delegates to the real fake provider and injects failures. */
class ControllableFakeProvider extends FakePaymentProvider {
  createFailure: CreateFailure = "none";
  subscribeFailure = false;
  hangSubscribe = false;
  getFailure: "none" | "unauthorized" | "unavailable" = "none";
  amountOverride: number | null = null;
  currencyOverride: string | null = null;
  orderIdOverride: number | null = null;
  statusOverride: ProviderPayment["status"] | null = null;
  unauthorizedTokens = new Set<string>();
  createCalls = 0;
  createdPayments = 0;
  cancelledPayments = 0;
  /** Runs after the provider payment was created but before it is returned. */
  onCreatePayment?: () => Promise<void> | void;
  getPaymentGate: { promise: Promise<void>; started: boolean } | null = null;

  override async createPayment(
    accessToken: string,
    input: CreateProviderPaymentInput,
  ): Promise<CreateProviderPaymentResult> {
    this.createCalls += 1;
    if (this.createFailure === "unavailable") {
      throw new PaymentProviderError("provider_unavailable");
    }
    if (this.createFailure === "invalid_request") {
      throw new PaymentProviderError("invalid_request");
    }
    if (this.createFailure === "unauthorized") {
      throw new PaymentProviderError("unauthorized");
    }
    const result = await super.createPayment(accessToken, input);
    this.createdPayments += 1;
    if (this.onCreatePayment) {
      await this.onCreatePayment();
    }
    return result;
  }

  override async subscribeWebhooks(accessToken: string, url: string): Promise<void> {
    if (this.hangSubscribe) {
      return new Promise<void>(() => {});
    }
    if (this.subscribeFailure) {
      throw new PaymentProviderError("provider_unavailable");
    }
    return super.subscribeWebhooks(accessToken, url);
  }

  override async getPayment(
    accessToken: string,
    providerPaymentId: string,
  ): Promise<ProviderPayment> {
    if (this.unauthorizedTokens.has(accessToken)) {
      throw new PaymentProviderError("unauthorized");
    }
    if (this.getFailure === "unauthorized") {
      throw new PaymentProviderError("unauthorized");
    }
    if (this.getFailure === "unavailable") {
      throw new PaymentProviderError("provider_unavailable");
    }
    if (this.getPaymentGate) {
      this.getPaymentGate.started = true;
      await this.getPaymentGate.promise;
    }
    const payment = await super.getPayment(accessToken, providerPaymentId);
    return {
      ...payment,
      ...(this.amountOverride === null ? {} : { amountKopecks: this.amountOverride }),
      ...(this.currencyOverride === null
        ? {}
        : { currency: this.currencyOverride as ProviderPayment["currency"] }),
      ...(this.orderIdOverride === null ? {} : { orderId: this.orderIdOverride }),
      ...(this.statusOverride === null ? {} : { status: this.statusOverride }),
    };
  }

  override async cancelPayment(accessToken: string, providerPaymentId: string): Promise<void> {
    this.cancelledPayments += 1;
    return super.cancelPayment(accessToken, providerPaymentId);
  }
}

describeWithDb("payments flow API", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });

    appModule = await import("../app.js");
    reconcileModule = await import("../payments/payments.reconcile.js");
    app = appModule.buildApp({ reconcile: false });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await dbClient?.requirePool().end();
  });

  beforeEach(async () => {
    await pool().query(
      "TRUNCATE TABLE payments, seller_payment_accounts, order_items, orders, products, shops, sellers, users, otp_codes CASCADE",
    );
  });

  it("connects and reconnects a seller account with versions, masked id and state checks", async () => {
    const seller = await createSeller();
    const otherSeller = await createSeller();

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/seller/payments/connect",
    });
    expect(unauthenticated.statusCode).toBe(401);

    const userWithoutSeller = await createUser();
    const noSeller = await request(app, userWithoutSeller, "POST", "/seller/payments/connect");
    expect(noSeller.statusCode).toBe(404);

    const start = await request(app, seller, "POST", "/seller/payments/connect");
    expect(start.statusCode).toBe(200);
    const consentUrl = start.json<{ consentUrl: string }>().consentUrl;
    const state = new URL(consentUrl).searchParams.get("state");
    expect(state).toBeTruthy();

    const badState = await app.inject({
      method: "GET",
      url: `/seller/payments/callback?code=x&state=tampered`,
      headers: { cookie: seller.cookie },
    });
    expect(badState.statusCode).toBe(400);

    const foreignState = await app.inject({
      method: "GET",
      url: `/seller/payments/callback?code=x&state=${encodeURIComponent(state ?? "")}`,
      headers: { cookie: otherSeller.cookie },
    });
    expect(foreignState.statusCode).toBe(403);

    const account = await connectAccount(app, seller);
    expect(account).toMatchObject({
      provider: "fake",
      isTest: true,
      status: "active",
    });
    expect(account.providerAccountId).not.toBe("fake-account-1");
    expect(account.providerAccountId.endsWith("nt-1")).toBe(true);

    const stored = await pool().query<{
      status: string;
      token_ciphertext: Buffer;
      token_key_version: number;
    }>(
      "SELECT status, token_ciphertext, token_key_version FROM seller_payment_accounts WHERE id = $1",
      [account.id],
    );
    expect(stored.rows[0]?.status).toBe("active");
    expect(stored.rows[0]?.token_key_version).toBe(1);
    expect(Buffer.isBuffer(stored.rows[0]?.token_ciphertext)).toBe(true);
    expect(stored.rows[0]?.token_ciphertext.toString("utf8")).not.toContain("fake_access");

    const current = await request(app, seller, "GET", "/seller/payments/account");
    expect(current.statusCode).toBe(200);
    expect(current.json().account).toMatchObject({ id: account.id, status: "active" });
    expect(current.headers["cache-control"]).toBe("no-store");

    // Expired state: signed with the real secret but issued 11 minutes ago.
    const secret = process.env.PAYMENTS_STATE_SECRET;
    if (!secret) {
      throw new Error("PAYMENTS_STATE_SECRET is required");
    }
    const { signPaymentState } = await import("../payments/state.js");
    const expired = signPaymentState(secret, seller.sellerId, Date.now() - 11 * 60_000);
    const expiredResponse = await app.inject({
      method: "GET",
      url: `/seller/payments/callback?code=expired&state=${encodeURIComponent(expired)}`,
      headers: { cookie: seller.cookie },
    });
    expect(expiredResponse.statusCode).toBe(400);

    const reconnected = await connectAccount(app, seller, { code: "second-code" });
    expect(reconnected.id).not.toBe(account.id);

    const versions = await pool().query<{ id: number; status: string }>(
      "SELECT id, status FROM seller_payment_accounts WHERE seller_id = $1 ORDER BY id",
      [seller.sellerId],
    );
    expect(versions.rows).toEqual([
      { id: account.id, status: "superseded" },
      { id: reconnected.id, status: "active" },
    ]);

    const afterReconnect = await request(app, seller, "GET", "/seller/payments/account");
    expect(afterReconnect.json().account).toMatchObject({ id: reconnected.id, status: "active" });

    // The OAuth state is one-time: the first callback consumes it, the replay
    // is rejected even with a fresh authorization code.
    const once = await app.inject({
      method: "GET",
      url: `/seller/payments/callback?code=once-code&state=${encodeURIComponent(state ?? "")}`,
      headers: { cookie: seller.cookie },
    });
    expect(once.statusCode).toBe(200);
    const replayedState = await app.inject({
      method: "GET",
      url: `/seller/payments/callback?code=another-code&state=${encodeURIComponent(state ?? "")}`,
      headers: { cookie: seller.cookie },
    });
    expect(replayedState.statusCode).toBe(400);
  });

  it("keeps the previous active account when the webhook subscription fails", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();

    try {
      const first = await connectAccount(target, seller);

      provider.subscribeFailure = true;
      const start = await request(target, seller, "POST", "/seller/payments/connect");
      const state = new URL(start.json<{ consentUrl: string }>().consentUrl).searchParams.get(
        "state",
      );
      const failed = await target.inject({
        method: "GET",
        url: `/seller/payments/callback?code=failing-subscribe&state=${encodeURIComponent(state ?? "")}`,
        headers: { cookie: seller.cookie },
      });
      expect(failed.statusCode).toBe(502);
      expect(failed.json()).toEqual({ error: "provider_unavailable" });

      const versions = await pool().query<{ status: string }>(
        "SELECT status FROM seller_payment_accounts WHERE seller_id = $1 ORDER BY id",
        [seller.sellerId],
      );
      expect(versions.rows.map((row) => row.status)).toEqual(["active", "error"]);

      const current = await request(target, seller, "GET", "/seller/payments/account");
      expect(current.json().account).toMatchObject({ id: first.id, status: "active" });
    } finally {
      await target.close();
    }
  });

  it("creates, completes and confirms a payment with idempotent replay and namespaced reads", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const otherBuyer = await createUser();
    const otherSeller = await createSeller();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(app, seller);

    const missingKey = await request(app, otherBuyer, "POST", `/orders/${orderId}/payments`);
    expect(missingKey.statusCode).toBe(400);
    const badKey = await createPayment(app, otherBuyer, orderId, "not-a-uuid");
    expect(badKey.statusCode).toBe(400);

    const empty = await request(app, buyer, "GET", `/orders/${orderId}/payment`);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ payment: null });

    const key = newIdempotencyKey();
    const created = await createPayment(app, buyer, orderId, key);
    expect(created.statusCode).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    const payment = created.json<{ payment: PaymentBody }>().payment;
    expect(payment).toMatchObject({
      status: "pending",
      amountKopecks: 420_000,
      currency: "RUB",
      paidAt: null,
    });
    expect(payment.confirmationUrl).toContain("/dev/payments/");
    expect(payment.confirmationUrl?.endsWith(`/dev/payments/${payment.id}/complete`)).toBe(true);
    expect(await orderStatus(orderId)).toBe("payment_pending");

    const replay = await createPayment(app, buyer, orderId, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ payment: PaymentBody }>().payment.id).toBe(payment.id);
    expect(replay.json<{ payment: PaymentBody }>().payment.confirmationUrl).toBe(
      payment.confirmationUrl,
    );
    expect(await countPayments(orderId)).toBe(1);

    const foreignCreate = await createPayment(app, otherBuyer, orderId);
    expect(foreignCreate.statusCode).toBe(404);

    const foreignComplete = await request(
      app,
      otherBuyer,
      "POST",
      `/dev/payments/${payment.id}/complete`,
    );
    expect(foreignComplete.statusCode).toBe(404);

    const complete = await request(app, buyer, "POST", `/dev/payments/${payment.id}/complete`);
    expect(complete.statusCode).toBe(200);

    const row = await paymentRow(payment.id);
    expect(row.provider_payment_id).toBeTruthy();
    if (!row.provider_payment_id) {
      throw new Error("provider payment id missing");
    }

    const unknown = await sendWebhook(app, `unknown-${randomUUID()}`);
    expect(unknown.statusCode).toBe(503);

    const webhook = await sendWebhook(app, row.provider_payment_id);
    expect(webhook.statusCode).toBe(200);
    expect(webhook.headers["cache-control"]).toBe("no-store");
    expect(webhook.json()).toEqual({ ok: true });

    const paidOrder = await request(app, buyer, "GET", `/orders/${orderId}`);
    expect(paidOrder.statusCode).toBe(200);
    expect(paidOrder.json().order.status).toBe("paid");

    const buyerPayment = await request(app, buyer, "GET", `/orders/${orderId}/payment`);
    expect(buyerPayment.statusCode).toBe(200);
    expect(buyerPayment.json().payment).toMatchObject({
      id: payment.id,
      status: "succeeded",
      confirmationUrl: null,
    });
    expect(buyerPayment.json().payment.paidAt).toBeTruthy();

    const sellerPayment = await request(app, seller, "GET", `/seller/orders/${orderId}/payment`);
    expect(sellerPayment.statusCode).toBe(200);
    expect(sellerPayment.json().payment).toMatchObject({
      id: payment.id,
      status: "succeeded",
      confirmationUrl: null,
    });

    expect((await request(app, otherBuyer, "GET", `/orders/${orderId}/payment`)).statusCode).toBe(
      404,
    );
    expect(
      (await request(app, otherSeller, "GET", `/seller/orders/${orderId}/payment`)).statusCode,
    ).toBe(404);

    const replayAfterPaid = await createPayment(app, buyer, orderId, key);
    expect(replayAfterPaid.statusCode).toBe(200);
    expect(replayAfterPaid.json().payment).toMatchObject({
      id: payment.id,
      status: "succeeded",
      confirmationUrl: null,
    });

    const newKeyAfterPaid = await createPayment(app, buyer, orderId);
    expect(newKeyAfterPaid.statusCode).toBe(409);
    expect(newKeyAfterPaid.json()).toEqual({ error: "order_already_paid" });

    const repeatedWebhook = await sendWebhook(app, row.provider_payment_id);
    expect(repeatedWebhook.statusCode).toBe(200);
    expect(await countPayments(orderId)).toBe(1);
    expect(await orderStatus(orderId)).toBe("paid");
  });

  it("rejects zero amount, an inactive seller account and payment_pending without an active payment", async () => {
    const seller = await createSeller();
    const buyer = await createUser();

    const zeroOrder = await createOrder(buyer.id, seller.shopId, 0);
    const zeroWithoutAccount = await createPayment(app, buyer, zeroOrder);
    expect(zeroWithoutAccount.statusCode).toBe(409);
    expect(zeroWithoutAccount.json()).toEqual({ error: "zero_amount" });

    const paidOrderWithoutAccount = await createOrder(buyer.id, seller.shopId, 100_000);
    const noAccount = await createPayment(app, buyer, paidOrderWithoutAccount);
    expect(noAccount.statusCode).toBe(409);
    expect(noAccount.json()).toEqual({ error: "seller_payment_unavailable" });

    await connectAccount(app, seller);
    const zero = await createPayment(app, buyer, zeroOrder);
    expect(zero.statusCode).toBe(409);
    expect(zero.json()).toEqual({ error: "zero_amount" });

    const brokenOrder = await createOrder(buyer.id, seller.shopId, 100_000, "payment_pending");
    const broken = await createPayment(app, buyer, brokenOrder);
    expect(broken.statusCode).toBe(409);
    expect(broken.json()).toEqual({ error: "invalid_order_transition" });
  });

  it("keeps a 5xx attempt pending: same key retries, a new key is blocked", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(target, seller);

    try {
      const key = newIdempotencyKey();
      provider.createFailure = "unavailable";
      const failed = await createPayment(target, buyer, orderId, key);
      expect(failed.statusCode).toBe(502);
      expect(failed.json()).toEqual({ error: "provider_unavailable" });

      const orphanQuery = await pool().query<{ id: number }>(
        "SELECT id FROM payments WHERE order_id = $1",
        [orderId],
      );
      const orphanId = orphanQuery.rows[0]?.id;
      if (!orphanId) {
        throw new Error("payment row missing after a 5xx create");
      }
      const orphan = await paymentRow(orphanId);
      expect(orphan.status).toBe("pending");
      expect(orphan.provider_payment_id).toBeNull();
      expect(await orderStatus(orderId)).toBe("new");

      const newKey = await createPayment(target, buyer, orderId);
      expect(newKey.statusCode).toBe(409);
      expect(newKey.json()).toEqual({ error: "payment_in_progress" });

      provider.createFailure = "none";
      const retried = await createPayment(target, buyer, orderId, key);
      expect(retried.statusCode).toBe(200);
      expect(retried.json().payment).toMatchObject({ id: orphan.id, status: "pending" });
      expect(await orderStatus(orderId)).toBe("payment_pending");
      expect(await countPayments(orderId)).toBe(1);
    } finally {
      await target.close();
    }
  });

  it("marks a 4xx attempt failed, retries the same key and allows a new key", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const retryOrder = await createOrder(buyer.id, seller.shopId);
    const freshOrder = await createOrder(buyer.id, seller.shopId);
    await connectAccount(target, seller);

    try {
      provider.createFailure = "invalid_request";
      const retryKey = newIdempotencyKey();
      const failed = await createPayment(target, buyer, retryOrder, retryKey);
      expect(failed.statusCode).toBe(502);

      const [failedRow] = (
        await pool().query<{ id: number; status: string }>(
          "SELECT id, status FROM payments WHERE order_id = $1",
          [retryOrder],
        )
      ).rows;
      expect(failedRow?.status).toBe("failed");
      expect(await orderStatus(retryOrder)).toBe("new");

      provider.createFailure = "none";
      const retried = await createPayment(target, buyer, retryOrder, retryKey);
      expect(retried.statusCode).toBe(200);
      expect(retried.json().payment).toMatchObject({
        id: failedRow?.id,
        status: "pending",
      });
      expect(retried.json().payment.confirmationUrl).toContain("/dev/payments/");
      expect(await countPayments(retryOrder)).toBe(1);
      expect(await orderStatus(retryOrder)).toBe("payment_pending");

      provider.createFailure = "invalid_request";
      const failedFresh = await createPayment(target, buyer, freshOrder);
      expect(failedFresh.statusCode).toBe(502);
      provider.createFailure = "none";
      const fresh = await createPayment(target, buyer, freshOrder);
      expect(fresh.statusCode).toBe(201);
      expect(await countPayments(freshOrder)).toBe(2);
      expect(await orderStatus(freshOrder)).toBe("payment_pending");
    } finally {
      await target.close();
    }
  });

  it("marks the account error on 401/403 and blocks further payments", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    const account = await connectAccount(target, seller);

    try {
      provider.createFailure = "unauthorized";
      const rejected = await createPayment(target, buyer, orderId);
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json()).toEqual({ error: "seller_payment_unavailable" });

      const stored = await pool().query<{ status: string }>(
        "SELECT status FROM seller_payment_accounts WHERE id = $1",
        [account.id],
      );
      expect(stored.rows[0]?.status).toBe("error");

      const current = await request(target, seller, "GET", "/seller/payments/account");
      expect(current.json().account).toMatchObject({ status: "error" });

      const blocked = await createPayment(target, buyer, orderId);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toEqual({ error: "seller_payment_unavailable" });
    } finally {
      await target.close();
    }
  });

  it("rate-limits payment creation at five attempts per buyer per minute", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(app, seller);

    let limited = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await createPayment(app, buyer, orderId);
      if (response.statusCode === 429) {
        limited += 1;
        expect(response.json()).toEqual({ error: "rate_limited" });
      }
    }
    expect(limited).toBeGreaterThanOrEqual(1);
  });

  it("quarantines a webhook amount mismatch and blocks a new payment", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(target, seller);

    try {
      const mismatchKey = newIdempotencyKey();
      const created = await createPayment(target, buyer, orderId, mismatchKey);
      const payment = created.json<{ payment: PaymentBody }>().payment;
      const row = await paymentRow(payment.id);
      if (!row.provider_payment_id) {
        throw new Error("provider payment id missing");
      }
      await completeFakePayment(target, row.provider_payment_id);

      provider.amountOverride = 1;
      const mismatch = await sendWebhook(target, row.provider_payment_id);
      expect(mismatch.statusCode).toBe(200);
      expect((await paymentRow(payment.id)).status).toBe("manual_review");
      expect(await orderStatus(orderId)).toBe("payment_pending");

      const newKey = await createPayment(target, buyer, orderId);
      expect(newKey.statusCode).toBe(409);
      expect(newKey.json()).toEqual({ error: "payment_requires_review" });

      const sameKey = await createPayment(target, buyer, orderId, mismatchKey);
      expect(sameKey.statusCode).toBe(409);
      expect(sameKey.json()).toEqual({ error: "payment_requires_review" });

      const read = await request(target, buyer, "GET", `/orders/${orderId}/payment`);
      expect(read.json().payment).toMatchObject({
        status: "manual_review",
        confirmationUrl: null,
      });
    } finally {
      await target.close();
    }
  });

  it("cancels a payment and returns the order to new, without touching a newer payment", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(app, seller);

    const first = (await createPayment(app, buyer, orderId)).json<{ payment: PaymentBody }>()
      .payment;
    const firstRow = await paymentRow(first.id);
    if (!firstRow.provider_payment_id) {
      throw new Error("provider payment id missing");
    }
    await completeFakePayment(app, firstRow.provider_payment_id, "canceled");
    expect((await sendWebhook(app, firstRow.provider_payment_id)).statusCode).toBe(200);

    expect((await paymentRow(first.id)).status).toBe("canceled");
    expect(await orderStatus(orderId)).toBe("new");

    const second = (await createPayment(app, buyer, orderId)).json<{ payment: PaymentBody }>()
      .payment;
    expect(second.status).toBe("pending");
    expect(await orderStatus(orderId)).toBe("payment_pending");

    // A repeated cancel for the old payment must not reset the status while
    // the second payment is active.
    expect((await sendWebhook(app, firstRow.provider_payment_id)).statusCode).toBe(200);
    expect(await orderStatus(orderId)).toBe("payment_pending");
    expect((await paymentRow(second.id)).status).toBe("pending");
  });

  it("serializes create and webhook on the order lock without inserting a second payment", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(app, seller);

    const first = (await createPayment(app, buyer, orderId)).json<{ payment: PaymentBody }>()
      .payment;
    const row = await paymentRow(first.id);
    if (!row.provider_payment_id) {
      throw new Error("provider payment id missing");
    }
    await completeFakePayment(app, row.provider_payment_id);

    const [webhook, newKey] = await Promise.all([
      sendWebhook(app, row.provider_payment_id),
      createPayment(app, buyer, orderId),
    ]);

    expect(webhook.statusCode).toBe(200);
    expect(newKey.statusCode).toBe(409);
    expect(["order_already_paid", "payment_in_progress"]).toContain(newKey.json().error);
    expect(await countPayments(orderId)).toBe(1);
    expect(await orderStatus(orderId)).toBe("paid");
  });

  it("blocks disconnect with a pending payment and disables the account otherwise", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    const account = await connectAccount(app, seller);

    const created = (await createPayment(app, buyer, orderId)).json<{ payment: PaymentBody }>()
      .payment;
    const blocked = await request(app, seller, "DELETE", "/seller/payments/account");
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: "payment_in_progress" });

    await pool().query("UPDATE payments SET status = 'canceled' WHERE id = $1", [created.id]);
    await pool().query("UPDATE orders SET status = 'new' WHERE id = $1", [orderId]);

    const disabled = await request(app, seller, "DELETE", "/seller/payments/account");
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().account).toMatchObject({ id: account.id, status: "disabled" });

    const token = await pool().query<{ token_ciphertext: Buffer }>(
      "SELECT token_ciphertext FROM seller_payment_accounts WHERE id = $1",
      [account.id],
    );
    expect(token.rows[0]?.token_ciphertext.length).toBeGreaterThan(0);

    const blockedNewPayment = await createPayment(app, buyer, orderId);
    expect(blockedNewPayment.statusCode).toBe(409);
    expect(blockedNewPayment.json()).toEqual({ error: "seller_payment_unavailable" });
  });

  it("reconciles a lost webhook and a 15-minute orphan", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(app, seller);
    const runtime = app.payments;
    if (!runtime) {
      throw new Error("payments runtime is missing");
    }

    const lost = (await createPayment(app, buyer, orderId)).json<{ payment: PaymentBody }>()
      .payment;
    const lostRow = await paymentRow(lost.id);
    if (!lostRow.provider_payment_id) {
      throw new Error("provider payment id missing");
    }
    await completeFakePayment(app, lostRow.provider_payment_id);
    await backdatePayment(lost.id, 3);

    await reconcileModule.runPaymentReconcile(runtime, app.log);
    expect((await paymentRow(lost.id)).status).toBe("succeeded");
    expect(await orderStatus(orderId)).toBe("paid");

    // Orphan: a 5xx create left a pending row without a provider id. A new
    // order keeps the cases independent.
    const orphanOrder = await createOrder(buyer.id, seller.shopId);
    const activeAccount = await pool().query<{ id: number }>(
      "SELECT id FROM seller_payment_accounts WHERE seller_id = $1 AND status = 'active'",
      [seller.sellerId],
    );
    const accountId = activeAccount.rows[0]?.id;
    if (!accountId) {
      throw new Error("active seller account missing");
    }
    const orphanPayment = await pool().query<{ id: number }>(
      `INSERT INTO payments (order_id, seller_account_id, provider, status, amount_kopecks, currency, idempotency_key)
       VALUES ($1, $2, 'fake', 'pending', 100, 'RUB', $3) RETURNING id`,
      [orphanOrder, accountId, randomUUID()],
    );
    const orphanId = orphanPayment.rows[0]?.id;
    if (!orphanId) {
      throw new Error("failed to insert an orphan payment");
    }
    await backdatePayment(orphanId, 16);

    await reconcileModule.runPaymentReconcile(runtime, app.log);
    expect((await paymentRow(orphanId)).status).toBe("manual_review");

    const blocked = await createPayment(app, buyer, orphanOrder);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: "payment_requires_review" });
  });

  it("marks the account error and quarantines after three unauthorized reconcile attempts", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    const account = await connectAccount(target, seller);
    const runtime = target.payments;
    if (!runtime) {
      throw new Error("payments runtime is missing");
    }

    try {
      const created = (await createPayment(target, buyer, orderId)).json<{ payment: PaymentBody }>()
        .payment;
      await backdatePayment(created.id, 3);
      provider.getFailure = "unauthorized";

      await reconcileModule.runPaymentReconcile(runtime, target.log);
      await reconcileModule.runPaymentReconcile(runtime, target.log);
      await reconcileModule.runPaymentReconcile(runtime, target.log);

      expect((await paymentRow(created.id)).status).toBe("manual_review");
      const stored = await pool().query<{ status: string }>(
        "SELECT status FROM seller_payment_accounts WHERE id = $1",
        [account.id],
      );
      expect(stored.rows[0]?.status).toBe("error");
    } finally {
      await target.close();
    }
  });

  it("blocks a new key while manual_review exists even when the order is still new", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(app, seller);

    const account = await pool().query<{ id: number }>(
      "SELECT id FROM seller_payment_accounts WHERE seller_id = $1 AND status = 'active'",
      [seller.sellerId],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) {
      throw new Error("active payment account missing");
    }

    await pool().query(
      `INSERT INTO payments (order_id, seller_account_id, provider, status, amount_kopecks, currency, idempotency_key)
       VALUES ($1, $2, 'fake', 'manual_review', 420000, 'RUB', $3)`,
      [orderId, accountId, randomUUID()],
    );

    const blocked = await createPayment(app, buyer, orderId);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: "payment_requires_review" });
    expect(await orderStatus(orderId)).toBe("new");
    expect(await countPayments(orderId)).toBe(1);
  });

  it("rate-limits webhooks at 60 per minute per IP", async () => {
    const target = await buildTestApp();
    try {
      let limited = 0;
      for (let attempt = 0; attempt < 61; attempt += 1) {
        const response = await sendWebhook(target, `unknown-${attempt}-${randomUUID()}`);
        if (response.statusCode === 429) {
          expect(response.json()).toEqual({ error: "rate_limited" });
          limited += 1;
          break;
        }
        expect(response.statusCode).toBe(503);
      }
      expect(limited).toBe(1);
    } finally {
      await target.close();
    }
  });

  it("does not let an old failed key bypass the active/paid gate", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(target, seller);

    try {
      const failedKey = newIdempotencyKey();
      provider.createFailure = "invalid_request";
      const failed = await createPayment(target, buyer, orderId, failedKey);
      expect(failed.statusCode).toBe(502);

      const [failedRow] = (
        await pool().query<{ id: number; status: string; provider_payment_id: string | null }>(
          "SELECT id, status, provider_payment_id FROM payments WHERE order_id = $1",
          [orderId],
        )
      ).rows;
      expect(failedRow?.status).toBe("failed");
      expect(failedRow?.provider_payment_id).toBeNull();

      provider.createFailure = "none";
      const activeKey = newIdempotencyKey();
      const active = await createPayment(target, buyer, orderId, activeKey);
      expect(active.statusCode).toBe(201);
      const activePayment = active.json<{ payment: PaymentBody }>().payment;
      expect(await countActivePayments(orderId)).toBe(1);

      const replayFailed = await createPayment(target, buyer, orderId, failedKey);
      expect(replayFailed.statusCode).toBe(409);
      expect(replayFailed.json()).toEqual({ error: "payment_in_progress" });
      expect(provider.createCalls).toBe(2);
      expect(provider.createdPayments).toBe(1);
      expect(await countActivePayments(orderId)).toBe(1);

      const stale = await paymentRow(failedRow?.id ?? 0);
      expect(stale.status).toBe("failed");
      expect(stale.confirmation_url).toBeNull();

      const activeRow = await paymentRow(activePayment.id);
      if (!activeRow.provider_payment_id) {
        throw new Error("provider payment id missing");
      }
      await completeFakePayment(target, activeRow.provider_payment_id);
      expect((await sendWebhook(target, activeRow.provider_payment_id)).statusCode).toBe(200);
      expect(await orderStatus(orderId)).toBe("paid");

      const replayAfterPaid = await createPayment(target, buyer, orderId, failedKey);
      expect(replayAfterPaid.statusCode).toBe(409);
      expect(replayAfterPaid.json()).toEqual({ error: "order_already_paid" });
      expect(provider.createCalls).toBe(2);
      expect(provider.createdPayments).toBe(1);

      const staleAfterPaid = await paymentRow(failedRow?.id ?? 0);
      expect(staleAfterPaid.status).toBe("failed");
      expect(staleAfterPaid.confirmation_url).toBeNull();
      const payableLinks = await pool().query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payments WHERE order_id = $1 AND confirmation_url IS NOT NULL",
        [orderId],
      );
      expect(payableLinks.rows[0]?.count).toBe(1);
    } finally {
      await target.close();
    }
  });

  it("cancels the provider payment when the order becomes paid during create", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(target, seller);

    try {
      provider.onCreatePayment = async () => {
        provider.onCreatePayment = undefined;
        await pool().query("UPDATE orders SET status = 'paid' WHERE id = $1", [orderId]);
      };

      const response = await createPayment(target, buyer, orderId);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "order_already_paid" });

      const rows = await pool().query<{
        status: string;
        confirmation_url: string | null;
        provider_payment_id: string | null;
      }>("SELECT status, confirmation_url, provider_payment_id FROM payments WHERE order_id = $1", [
        orderId,
      ]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        status: "failed",
        confirmation_url: null,
        provider_payment_id: null,
      });
      expect(provider.createdPayments).toBe(1);
      expect(provider.cancelledPayments).toBe(1);
      expect(await countActivePayments(orderId)).toBe(0);
    } finally {
      await target.close();
    }
  });

  it("does not hold the order lock during a slow reconcile provider call", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(target, seller);
    const runtime = target.payments;
    if (!runtime) {
      throw new Error("payments runtime is missing");
    }

    try {
      const created = (await createPayment(target, buyer, orderId)).json<{ payment: PaymentBody }>()
        .payment;
      await backdatePayment(created.id, 3);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      provider.getPaymentGate = { promise: gate, started: false };

      const reconcile = reconcileModule.runPaymentReconcile(runtime, target.log);
      const deadline = Date.now() + 2_000;
      while (!provider.getPaymentGate.started) {
        if (Date.now() > deadline) {
          throw new Error("reconcile never called the provider");
        }
        await sleep(10);
      }

      expect(await countOrderAdvisoryLocks(orderId)).toBe(0);
      const startedAt = Date.now();
      const concurrentCreate = await createPayment(target, buyer, orderId);
      expect(concurrentCreate.statusCode).toBe(409);
      expect(Date.now() - startedAt).toBeLessThan(500);

      release();
      await reconcile;
      expect((await paymentRow(created.id)).status).toBe("pending");
    } finally {
      await target.close();
    }
  });

  it("serializes create and disconnect so a payment never references a disabled account", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seller = await createSeller();
      const buyer = await createUser();
      const orderId = await createOrder(buyer.id, seller.shopId);
      await connectAccount(app, seller);

      const [created, deleted] = await Promise.all([
        createPayment(app, buyer, orderId),
        request(app, seller, "DELETE", "/seller/payments/account"),
      ]);

      if (deleted.statusCode === 200) {
        expect(deleted.json().account.status).toBe("disabled");
        expect(created.statusCode).toBe(409);
        expect(created.json()).toEqual({ error: "seller_payment_unavailable" });
        expect(await countPayments(orderId)).toBe(0);
      } else {
        expect(deleted.statusCode).toBe(409);
        expect(created.statusCode).toBe(201);
        expect(await countActivePayments(orderId)).toBe(1);
      }
    }
  });

  it("times out a hanging OAuth webhook subscription", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    provider.hangSubscribe = true;
    const target = await buildTestApp(provider, { paymentProviderTimeoutMs: 50 });
    const seller = await createSeller();

    try {
      const start = await request(target, seller, "POST", "/seller/payments/connect");
      const state = new URL(start.json<{ consentUrl: string }>().consentUrl).searchParams.get(
        "state",
      );
      const startedAt = Date.now();
      const callback = await target.inject({
        method: "GET",
        url: `/seller/payments/callback?code=hanging-subscribe&state=${encodeURIComponent(state ?? "")}`,
        headers: { cookie: seller.cookie },
      });
      expect(callback.statusCode).toBe(502);
      expect(Date.now() - startedAt).toBeLessThan(2_000);

      const versions = await pool().query<{ status: string }>(
        "SELECT status FROM seller_payment_accounts WHERE seller_id = $1",
        [seller.sellerId],
      );
      expect(versions.rows.map((row) => row.status)).toEqual(["error"]);
    } finally {
      await target.close();
    }
  });

  it("returns 502 on a webhook provider error and quarantines currency/order/status mismatches", async () => {
    const errorProvider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const errorTarget = await buildTestApp(errorProvider);
    const errorSeller = await createSeller();
    const errorBuyer = await createUser();
    const errorOrder = await createOrder(errorBuyer.id, errorSeller.shopId);
    await connectAccount(errorTarget, errorSeller);

    try {
      const created = (await createPayment(errorTarget, errorBuyer, errorOrder)).json<{
        payment: PaymentBody;
      }>().payment;
      const row = await paymentRow(created.id);
      if (!row.provider_payment_id) {
        throw new Error("provider payment id missing");
      }
      errorProvider.getFailure = "unavailable";
      const failed = await sendWebhook(errorTarget, row.provider_payment_id);
      expect(failed.statusCode).toBe(502);
      expect((await paymentRow(created.id)).status).toBe("pending");
      expect(await orderStatus(errorOrder)).toBe("payment_pending");
    } finally {
      await errorTarget.close();
    }

    const cases: Array<{
      name: string;
      apply: (provider: ControllableFakeProvider) => void;
    }> = [
      { name: "currency", apply: (provider) => (provider.currencyOverride = "USD") },
      { name: "order", apply: (provider) => (provider.orderIdOverride = 999_999) },
      {
        name: "status",
        apply: (provider) =>
          (provider.statusOverride = "waiting_for_capture" as ProviderPayment["status"]),
      },
    ];

    for (const testCase of cases) {
      const provider = new ControllableFakeProvider({
        enabled: true,
        webOrigin: "http://localhost:5173",
      });
      const target = await buildTestApp(provider);
      const seller = await createSeller();
      const buyer = await createUser();
      const orderId = await createOrder(buyer.id, seller.shopId);
      await connectAccount(target, seller);

      try {
        const created = (await createPayment(target, buyer, orderId)).json<{
          payment: PaymentBody;
        }>().payment;
        const row = await paymentRow(created.id);
        if (!row.provider_payment_id) {
          throw new Error("provider payment id missing");
        }

        testCase.apply(provider);
        const response = await sendWebhook(target, row.provider_payment_id);
        expect(response.statusCode, testCase.name).toBe(200);
        expect((await paymentRow(created.id)).status, testCase.name).toBe("manual_review");
        expect(await orderStatus(orderId), testCase.name).toBe("payment_pending");
        expect(await countActivePayments(orderId), testCase.name).toBe(1);
      } finally {
        await target.close();
      }
    }
  });

  it("uses a newer active account version during reconcile when the old token is unauthorized", async () => {
    const provider = new ControllableFakeProvider({
      enabled: true,
      webOrigin: "http://localhost:5173",
    });
    const target = await buildTestApp(provider);
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    const oldAccount = await connectAccount(target, seller, { code: "code-old" });
    const runtime = target.payments;
    if (!runtime) {
      throw new Error("payments runtime is missing");
    }

    try {
      const created = (await createPayment(target, buyer, orderId)).json<{ payment: PaymentBody }>()
        .payment;
      const row = await paymentRow(created.id);
      if (!row.provider_payment_id) {
        throw new Error("provider payment id missing");
      }
      await completeFakePayment(target, row.provider_payment_id);

      const newAccount = await connectAccount(target, seller, { code: "code-new" });
      expect(newAccount.id).not.toBe(oldAccount.id);
      provider.unauthorizedTokens.add("fake_access_code-old");
      await backdatePayment(created.id, 3);

      await reconcileModule.runPaymentReconcile(runtime, target.log);

      expect((await paymentRow(created.id)).status).toBe("succeeded");
      expect(await orderStatus(orderId)).toBe("paid");
      const versions = await pool().query<{ status: string }>(
        "SELECT status FROM seller_payment_accounts WHERE seller_id = $1 ORDER BY id",
        [seller.sellerId],
      );
      expect(versions.rows.map((entry) => entry.status)).toEqual(["superseded", "active"]);
    } finally {
      await target.close();
    }
  });

  it("blocks disconnect on manual_review and requires a session for account reads", async () => {
    const seller = await createSeller();
    const buyer = await createUser();
    const orderId = await createOrder(buyer.id, seller.shopId);
    await connectAccount(app, seller);

    const account = await pool().query<{ id: number }>(
      "SELECT id FROM seller_payment_accounts WHERE seller_id = $1 AND status = 'active'",
      [seller.sellerId],
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) {
      throw new Error("active payment account missing");
    }
    await pool().query(
      `INSERT INTO payments (order_id, seller_account_id, provider, status, amount_kopecks, currency, idempotency_key)
       VALUES ($1, $2, 'fake', 'manual_review', 420000, 'RUB', $3)`,
      [orderId, accountId, randomUUID()],
    );

    const blocked = await request(app, seller, "DELETE", "/seller/payments/account");
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: "payment_requires_review" });

    const getWithoutSession = await app.inject({
      method: "GET",
      url: "/seller/payments/account",
    });
    const deleteWithoutSession = await app.inject({
      method: "DELETE",
      url: "/seller/payments/account",
    });
    expect(getWithoutSession.statusCode).toBe(401);
    expect(deleteWithoutSession.statusCode).toBe(401);
  });

  it("validates webhook body and enforces the body limit", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/payments/yookassa/webhook",
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);

    const oversized = await app.inject({
      method: "POST",
      url: "/payments/yookassa/webhook",
      payload: {
        object: { id: "x" },
        padding: "a".repeat(20_000),
      },
    });
    expect(oversized.statusCode).toBe(413);
  });
});
