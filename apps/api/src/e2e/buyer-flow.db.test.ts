import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { OrderSummary } from "@localhand/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";

/**
 * End-to-end API test of the buyer core on a real database:
 * dev OTP -> published shops/products -> checkout -> buyer orders (own) ->
 * seller orders (own shop). A second buyer and a second seller must not see
 * or read somebody else's order, and a user without a shop gets an empty
 * seller list instead of a 404.
 *
 * Every log line written on a failed checkout/order read is checked in
 * `orders.logs.test.ts`; this suite proves the happy path, authz and the
 * `Cache-Control: no-store` header on PII responses.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST;

// A skipped real-DB e2e is a silent coverage hole in CI, so fail loudly.
if (process.env.CI && !testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required to run the buyer flow e2e in CI");
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

// The suite truncates tables in beforeEach: never run it against a non-test DB.
if (testDatabaseUrl) {
  assertTestDatabase(testDatabaseUrl);
}

const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");

let appModule!: AppModule;
let app!: ReturnType<AppModule["buildApp"]>;
let dbClient!: DbClientModule;

function phone(...parts: string[]): string {
  return parts.join("");
}

// Unique phones per test keep the in-memory request-code limiter independent
// of test order: no number is requested more than twice per file.
const SELLER_PHONE = phone("+7", "999", "555", "20", "01");
const SECOND_SELLER_PHONE = phone("+7", "999", "555", "20", "02");
const BUYER_PHONE = phone("+7", "999", "555", "20", "03");
const OTHER_BUYER_PHONE = phone("+7", "999", "555", "21", "01");
const OTHER_SELLER_PHONE = phone("+7", "999", "555", "21", "02");
const NO_SHOP_PHONE = phone("+7", "999", "555", "21", "03");

const FIRST_SHOP_SLUG = "s2-4-vintage";
const SECOND_SHOP_SLUG = "s2-4-second";
const COMMENT = "Позвонить перед доставкой";

type Session = { user: { id: number; phone: string }; cookie: string };
type Shop = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "blocked";
};
type Product = {
  id: number;
  name: string;
  description: string | null;
  priceKopecks: number;
  imageUrl: string | null;
  status: "draft" | "published" | "hidden";
};

function sessionCookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value.join("\n") : String(value ?? "");
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;\\n]+)`).exec(header);
  const token = match?.[1];
  if (!token) {
    throw new Error("verify-code response did not set the session cookie");
  }
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function login(targetPhone: string): Promise<Session> {
  const requested = await app.inject({
    method: "POST",
    url: "/auth/request-code",
    payload: { phone: targetPhone },
  });
  expect(requested.statusCode).toBe(200);
  const devCode = requested.json<{ devCode?: string }>().devCode;
  expect(devCode).toMatch(/^\d{6}$/);

  const verified = await app.inject({
    method: "POST",
    url: "/auth/verify-code",
    payload: { phone: targetPhone, code: devCode },
  });
  expect(verified.statusCode).toBe(200);

  const user = verified.json<{ user: { id: number; phone: string } }>().user;
  expect(user.phone).toBe(targetPhone);

  return { user, cookie: sessionCookieFrom(verified) };
}

function request(method: "GET" | "POST" | "PATCH", url: string, cookie: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

async function createPublishedShop(
  session: Session,
  input: { name: string; slug: string; description?: string },
): Promise<Shop> {
  const created = await request("POST", "/seller/shop", session.cookie, input);
  expect(created.statusCode).toBe(201);

  const published = await request("PATCH", "/seller/shop", session.cookie, {
    status: "published",
  });
  expect(published.statusCode).toBe(200);
  expect(published.json()).toEqual({
    shop: expect.objectContaining({ slug: input.slug, status: "published" }),
  });

  return created.json<{ shop: Shop }>().shop;
}

async function createPublishedProduct(
  session: Session,
  input: { name: string; priceKopecks: number },
): Promise<Product> {
  const created = await request("POST", "/seller/products", session.cookie, input);
  expect(created.statusCode).toBe(201);
  const product = created.json<{ product: Product }>().product;

  const published = await request("PATCH", `/seller/products/${product.id}`, session.cookie, {
    status: "published",
  });
  expect(published.statusCode).toBe(200);

  return product;
}

async function countRows(table: "orders" | "order_items"): Promise<number> {
  const result = await dbClient
    .requirePool()
    .query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return result.rows[0]?.count ?? 0;
}

function sortById<T extends { id: number }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.id - right.id);
}

function orderIds(orders: OrderSummary[]): number[] {
  return sortById(orders).map((order) => order.id);
}

/**
 * Fail before any request-code if the API would use a real SMS adapter. The
 * vitest config forces SMS_PROVIDER=dev, but this preflight also protects a
 * manually started API or a future config regression.
 */
async function expectDevSmsProvider(): Promise<void> {
  const response = await app.inject({ method: "GET", url: "/health" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ smsProvider: "dev" });
}

describeWithDb("buyer flow end-to-end with a real database", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });

    appModule = await import("../app.js");
    app = appModule.buildApp();
    await app.ready();
    await expectDevSmsProvider();
  });

  afterAll(async () => {
    await app?.close();
    await dbClient?.requirePool().end();
  });

  beforeEach(async () => {
    await dbClient
      .requirePool()
      .query(
        "TRUNCATE TABLE order_items, orders, products, shops, sellers, users, otp_codes RESTART IDENTITY CASCADE",
      );
  });

  it("takes a buyer from dev OTP through checkout to buyer and seller orders", async () => {
    const sellerA = await login(SELLER_PHONE);
    const sellerB = await login(SECOND_SELLER_PHONE);
    const buyer = await login(BUYER_PHONE);

    const me = await request("GET", "/auth/me", buyer.cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: buyer.user });

    const shopA = await createPublishedShop(sellerA, {
      name: "Винтаж на районе",
      slug: FIRST_SHOP_SLUG,
      description: "Секонд-хенд и винтаж",
    });
    const shopB = await createPublishedShop(sellerB, {
      name: "Второй магазин",
      slug: SECOND_SHOP_SLUG,
    });

    const jacket = await createPublishedProduct(sellerA, {
      name: "Куртка 90-х",
      priceKopecks: 420_000,
    });
    const boots = await createPublishedProduct(sellerB, {
      name: "Ботинки",
      priceKopecks: 350_000,
    });

    const catalog = await app.inject({ method: "GET", url: "/catalog/products" });
    expect(catalog.statusCode).toBe(200);
    const catalogIds = catalog
      .json<{ products: Array<{ id: number }> }>()
      .products.map(({ id }) => id)
      .sort((left, right) => left - right);
    expect(catalogIds).toEqual([jacket.id, boots.id].sort((left, right) => left - right));

    const clientCheckoutId = randomUUID();
    const payload = {
      items: [{ productId: jacket.id }, { productId: boots.id }],
      comment: `  ${COMMENT}  `,
      clientCheckoutId,
    };

    const checkoutResponse = await request("POST", "/checkout", buyer.cookie, payload);
    expect(checkoutResponse.statusCode).toBe(201);
    expect(checkoutResponse.headers["cache-control"]).toBe("no-store");

    const created = checkoutResponse.json<{ orders: OrderSummary[] }>().orders;
    expect(created).toHaveLength(2);
    const [orderA, orderB] = sortById(created);
    if (!orderA || !orderB) {
      throw new Error("expected one order per shop");
    }

    expect(orderA).toMatchObject({
      shop: { slug: FIRST_SHOP_SLUG, name: "Винтаж на районе" },
      status: "new",
      totalKopecks: 420_000,
      buyerPhone: buyer.user.phone,
      comment: COMMENT,
    });
    expect(orderA.items).toEqual([
      { productId: jacket.id, name: "Куртка 90-х", priceKopecks: 420_000, quantity: 1 },
    ]);
    expect(orderB).toMatchObject({
      shop: { slug: SECOND_SHOP_SLUG, name: "Второй магазин" },
      status: "new",
      totalKopecks: 350_000,
      buyerPhone: buyer.user.phone,
      comment: COMMENT,
    });
    expect(orderB.items).toEqual([
      { productId: boots.id, name: "Ботинки", priceKopecks: 350_000, quantity: 1 },
    ]);

    expect(await countRows("orders")).toBe(2);
    expect(await countRows("order_items")).toBe(2);

    const stored = await dbClient.requirePool().query<{
      shop_id: number;
      buyer_user_id: number;
      buyer_phone: string;
      client_checkout_id: string;
    }>("SELECT shop_id, buyer_user_id, buyer_phone, client_checkout_id FROM orders ORDER BY id");
    expect(stored.rows).toEqual([
      {
        shop_id: shopA.id,
        buyer_user_id: buyer.user.id,
        buyer_phone: buyer.user.phone,
        client_checkout_id: clientCheckoutId,
      },
      {
        shop_id: shopB.id,
        buyer_user_id: buyer.user.id,
        buyer_phone: buyer.user.phone,
        client_checkout_id: clientCheckoutId,
      },
    ]);

    // The same checkout id is a replay: it returns the committed orders and
    // never creates another set, even if the items list changed afterwards.
    const replay = await request("POST", "/checkout", buyer.cookie, {
      ...payload,
      items: [{ productId: boots.id }],
    });
    expect(replay.statusCode).toBe(201);
    expect(orderIds(replay.json<{ orders: OrderSummary[] }>().orders)).toEqual(orderIds(created));
    expect(await countRows("orders")).toBe(2);

    const mine = await request("GET", "/orders/mine", buyer.cookie);
    expect(mine.statusCode).toBe(200);
    expect(mine.headers["cache-control"]).toBe("no-store");
    expect(orderIds(mine.json<{ orders: OrderSummary[] }>().orders)).toEqual(orderIds(created));

    const detail = await request("GET", `/orders/${orderA.id}`, buyer.cookie);
    expect(detail.statusCode).toBe(200);
    expect(detail.headers["cache-control"]).toBe("no-store");
    expect(detail.json()).toEqual({ order: orderA });

    const sellerAOrders = await request("GET", "/seller/orders", sellerA.cookie);
    expect(sellerAOrders.statusCode).toBe(200);
    expect(sellerAOrders.headers["cache-control"]).toBe("no-store");
    expect(sellerAOrders.json<{ orders: OrderSummary[] }>().orders).toEqual([orderA]);

    const sellerBOrders = await request("GET", "/seller/orders", sellerB.cookie);
    expect(sellerBOrders.statusCode).toBe(200);
    expect(sellerBOrders.json<{ orders: OrderSummary[] }>().orders).toEqual([orderB]);

    const sellerADetail = await request("GET", `/seller/orders/${orderA.id}`, sellerA.cookie);
    expect(sellerADetail.statusCode).toBe(200);
    expect(sellerADetail.headers["cache-control"]).toBe("no-store");
    expect(sellerADetail.json()).toEqual({ order: orderA });

    const foreignSellerDetail = await request("GET", `/seller/orders/${orderB.id}`, sellerA.cookie);
    expect(foreignSellerDetail.statusCode).toBe(404);
    expect(foreignSellerDetail.json()).toEqual({ error: "not_found" });

    const foreignBuyerDetail = await request("GET", `/orders/${orderB.id}`, sellerA.cookie);
    expect(foreignBuyerDetail.statusCode).toBe(404);
    expect(foreignBuyerDetail.json()).toEqual({ error: "not_found" });
  });

  it("keeps other buyers and sellers out and returns an empty list without a shop", async () => {
    const seller = await login(SELLER_PHONE);
    const buyer = await login(BUYER_PHONE);

    await createPublishedShop(seller, { name: "Винтаж на районе", slug: FIRST_SHOP_SLUG });
    const product = await createPublishedProduct(seller, {
      name: "Куртка 90-х",
      priceKopecks: 420_000,
    });

    const checkoutResponse = await request("POST", "/checkout", buyer.cookie, {
      items: [{ productId: product.id }],
      comment: COMMENT,
      clientCheckoutId: randomUUID(),
    });
    expect(checkoutResponse.statusCode).toBe(201);
    const [order] = checkoutResponse.json<{ orders: OrderSummary[] }>().orders;
    if (!order) {
      throw new Error("checkout did not create an order");
    }

    const otherBuyer = await login(OTHER_BUYER_PHONE);
    expect(otherBuyer.user.id).not.toBe(buyer.user.id);

    const otherBuyerOrders = await request("GET", "/orders/mine", otherBuyer.cookie);
    expect(otherBuyerOrders.statusCode).toBe(200);
    expect(otherBuyerOrders.json()).toEqual({ orders: [] });

    const foreignOrder = await request("GET", `/orders/${order.id}`, otherBuyer.cookie);
    expect(foreignOrder.statusCode).toBe(404);
    expect(foreignOrder.json()).toEqual({ error: "not_found" });
    expect(foreignOrder.body).not.toContain(buyer.user.phone);
    expect(foreignOrder.body).not.toContain(COMMENT);

    const otherSeller = await login(OTHER_SELLER_PHONE);
    await createPublishedShop(otherSeller, { name: "Второй магазин", slug: SECOND_SHOP_SLUG });

    const otherSellerOrders = await request("GET", "/seller/orders", otherSeller.cookie);
    expect(otherSellerOrders.statusCode).toBe(200);
    expect(otherSellerOrders.json()).toEqual({ orders: [] });

    const foreignSellerOrder = await request(
      "GET",
      `/seller/orders/${order.id}`,
      otherSeller.cookie,
    );
    expect(foreignSellerOrder.statusCode).toBe(404);
    expect(foreignSellerOrder.json()).toEqual({ error: "not_found" });
    expect(foreignSellerOrder.body).not.toContain(buyer.user.phone);
    expect(foreignSellerOrder.body).not.toContain(COMMENT);

    const noShopSeller = await login(NO_SHOP_PHONE);
    const noShopOrders = await request("GET", "/seller/orders", noShopSeller.cookie);
    expect(noShopOrders.statusCode).toBe(200);
    expect(noShopOrders.json()).toEqual({ orders: [] });

    const unauthenticated = await Promise.all([
      app.inject({ method: "GET", url: "/orders/mine" }),
      app.inject({ method: "GET", url: `/orders/${order.id}` }),
      app.inject({ method: "GET", url: "/seller/orders" }),
      app.inject({ method: "GET", url: `/seller/orders/${order.id}` }),
      app.inject({
        method: "POST",
        url: "/checkout",
        payload: { items: [{ productId: product.id }], clientCheckoutId: randomUUID() },
      }),
    ]);

    for (const response of unauthenticated) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    }
  });
});
