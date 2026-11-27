import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CheckoutResponseSchema, OrderResponseSchema } from "@localhand/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
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

function userPhone(index: number): string {
  return phone("+7", "999", String(index).padStart(7, "0"));
}

type TestUser = { id: number; phone: string; cookie: string };

async function createUser(index: number): Promise<TestUser> {
  const phoneNumber = userPhone(index);
  const result = await dbClient
    .requirePool()
    .query<{ id: number }>("INSERT INTO users (phone) VALUES ($1) RETURNING id", [phoneNumber]);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test user");
  }

  return { id, phone: phoneNumber, cookie: `${SESSION_COOKIE_NAME}=${app.jwt.sign({ sub: id })}` };
}

function request(user: TestUser, method: "GET" | "POST", url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie: user.cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

type ShopBody = { id: number; slug: string; name: string; status: string };

async function createShop(user: TestUser, slug: string, name = "Винтаж на районе") {
  const response = await request(user, "POST", "/seller/shop", { name, slug });
  expect(response.statusCode).toBe(201);
  return response.json().shop as ShopBody;
}

async function updateShop(user: TestUser, payload: Record<string, unknown>): Promise<void> {
  const response = await app.inject({
    method: "PATCH",
    url: "/seller/shop",
    headers: { cookie: user.cookie },
    payload,
  });
  expect(response.statusCode).toBe(200);
}

type ProductBody = {
  id: number;
  name: string;
  description: string | null;
  priceKopecks: number;
  imageUrl: string | null;
  status: string;
};

async function createProduct(
  user: TestUser,
  payload: Record<string, unknown>,
): Promise<ProductBody> {
  const response = await request(user, "POST", "/seller/products", payload);
  expect(response.statusCode).toBe(201);
  return response.json().product as ProductBody;
}

async function createPublishedProduct(
  user: TestUser,
  payload: { name: string; priceKopecks: number },
): Promise<ProductBody> {
  const product = await createProduct(user, payload);
  await updateShop(user, { status: "published" });
  const response = await app.inject({
    method: "PATCH",
    url: `/seller/products/${product.id}`,
    headers: { cookie: user.cookie },
    payload: { status: "published" },
  });
  expect(response.statusCode).toBe(200);
  return response.json().product as ProductBody;
}

type OrderBody = {
  id: number;
  shop: { slug: string; name: string };
  status: string;
  totalKopecks: number;
  buyerPhone: string;
  comment: string | null;
  createdAt: string;
  items: Array<{
    productId: number | null;
    name: string;
    priceKopecks: number;
    quantity: number;
  }>;
};

function checkoutPayload(
  productIds: number[],
  options: { clientCheckoutId?: string; comment?: string } = {},
) {
  return {
    items: productIds.map((productId) => ({ productId })),
    clientCheckoutId: options.clientCheckoutId ?? randomUUID(),
    ...(options.comment === undefined ? {} : { comment: options.comment }),
  };
}

async function checkout(user: TestUser, productIds: number[], options = {}) {
  return request(user, "POST", "/checkout", checkoutPayload(productIds, options));
}

async function countOrders(): Promise<{ orders: number; items: number }> {
  const result = await dbClient
    .requirePool()
    .query<{ orders: number; items: number }>(
      "SELECT (SELECT count(*)::int FROM orders) AS orders, (SELECT count(*)::int FROM order_items) AS items",
    );
  return result.rows[0] ?? { orders: 0, items: 0 };
}

async function countLockWaiters(condition: string): Promise<number> {
  const result = await dbClient
    .requirePool()
    .query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_locks WHERE NOT granted AND ${condition}`,
    );
  return result.rows[0]?.count ?? 0;
}

async function waitForLockWaiter(condition: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await countLockWaiters(condition)) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for a lock waiter: ${condition}`);
}

// The racing checkout either commits its own order (no advisory lock) or waits
// on the advisory lock held by the blocked checkout (advisory lock works).
async function waitForRacingCheckout(): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await countOrders()).orders > 0) {
      return;
    }
    if ((await countLockWaiters("locktype = 'advisory'")) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for the racing checkout");
}

function sortById<T extends { id: number }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.id - right.id);
}

function sortByProductId<T extends { productId: number | null }>(values: T[]): T[] {
  return [...values].sort((left, right) => (left.productId ?? 0) - (right.productId ?? 0));
}

describeWithDb("checkout and orders routes with a real database", () => {
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
  });

  afterAll(async () => {
    await app?.close();
    await dbClient?.requirePool().end();
  });

  beforeEach(async () => {
    // Do not restart identities: rate-limit keys are user ids, and a fresh
    // user id per test keeps the in-memory checkout limiter independent.
    await dbClient
      .requirePool()
      .query(
        "TRUNCATE TABLE order_items, orders, products, shops, sellers, users, otp_codes CASCADE",
      );
  });

  it("returns 401 on every checkout and order route without a session", async () => {
    const productId = 1;
    const requests = [
      app.inject({
        method: "POST",
        url: "/checkout",
        payload: checkoutPayload([productId]),
      }),
      app.inject({ method: "GET", url: "/orders/mine" }),
      app.inject({ method: "GET", url: `/orders/${productId}` }),
      app.inject({ method: "GET", url: "/seller/orders" }),
      app.inject({ method: "GET", url: `/seller/orders/${productId}` }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    }

    expect(await countOrders()).toEqual({ orders: 0, items: 0 });
  });

  it("creates one order per shop with a server snapshot and returns it to buyer and seller", async () => {
    const first = await createUser(1);
    const second = await createUser(2);
    const buyer = await createUser(3);

    await createShop(first, "first-shop", "Первый магазин");
    await createShop(second, "second-shop", "Второй магазин");
    const jacket = await createPublishedProduct(first, {
      name: "Куртка 90-х",
      priceKopecks: 420_000,
    });
    const scarf = await createPublishedProduct(first, {
      name: "Шарф",
      priceKopecks: 80_000,
    });
    const boots = await createPublishedProduct(second, {
      name: "Ботинки",
      priceKopecks: 350_000,
    });

    const clientCheckoutId = randomUUID();
    const response = await checkout(buyer, [jacket.id, scarf.id, boots.id], {
      clientCheckoutId,
      comment: "  Позвонить перед доставкой  ",
    });

    expect(response.statusCode).toBe(201);
    const orders = response.json().orders as OrderBody[];
    expect(orders).toHaveLength(2);

    const [firstOrder, secondOrder] = sortById(orders);
    if (!firstOrder || !secondOrder) {
      throw new Error("expected two orders");
    }

    expect(firstOrder).toMatchObject({
      shop: { slug: "first-shop", name: "Первый магазин" },
      status: "new",
      totalKopecks: 500_000,
      buyerPhone: buyer.phone,
      comment: "Позвонить перед доставкой",
    });
    expect(Number.isNaN(Date.parse(firstOrder.createdAt))).toBe(false);
    expect(sortByProductId(firstOrder.items)).toEqual([
      { productId: jacket.id, name: "Куртка 90-х", priceKopecks: 420_000, quantity: 1 },
      { productId: scarf.id, name: "Шарф", priceKopecks: 80_000, quantity: 1 },
    ]);

    expect(secondOrder).toMatchObject({
      shop: { slug: "second-shop", name: "Второй магазин" },
      status: "new",
      totalKopecks: 350_000,
      buyerPhone: buyer.phone,
      comment: "Позвонить перед доставкой",
    });
    expect(secondOrder.items).toEqual([
      { productId: boots.id, name: "Ботинки", priceKopecks: 350_000, quantity: 1 },
    ]);

    expect(await countOrders()).toEqual({ orders: 2, items: 3 });

    const stored = await dbClient.requirePool().query<{
      buyer_user_id: number;
      buyer_phone: string;
      client_checkout_id: string;
    }>("SELECT buyer_user_id, buyer_phone, client_checkout_id FROM orders ORDER BY id");
    expect(stored.rows).toEqual([
      { buyer_user_id: buyer.id, buyer_phone: buyer.phone, client_checkout_id: clientCheckoutId },
      { buyer_user_id: buyer.id, buyer_phone: buyer.phone, client_checkout_id: clientCheckoutId },
    ]);

    const mine = await request(buyer, "GET", "/orders/mine");
    expect(mine.statusCode).toBe(200);
    expect(mine.json().orders).toHaveLength(2);

    const detail = await request(buyer, "GET", `/orders/${firstOrder.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().order).toMatchObject({ id: firstOrder.id, totalKopecks: 500_000 });

    const sellerOrders = await request(first, "GET", "/seller/orders");
    expect(sellerOrders.statusCode).toBe(200);
    const sellerList = sellerOrders.json().orders as OrderBody[];
    expect(sellerList.map((order) => order.id)).toEqual([firstOrder.id]);
    expect(sellerList[0]?.buyerPhone).toBe(buyer.phone);

    const sellerDetail = await request(first, "GET", `/seller/orders/${firstOrder.id}`);
    expect(sellerDetail.statusCode).toBe(200);
    expect(sellerDetail.json().order.id).toBe(firstOrder.id);

    const secondSellerDetail = await request(second, "GET", `/seller/orders/${secondOrder.id}`);
    expect(secondSellerDetail.statusCode).toBe(200);
    const foreignSellerDetail = await request(second, "GET", `/seller/orders/${firstOrder.id}`);
    expect(foreignSellerDetail.statusCode).toBe(404);

    await dbClient
      .requirePool()
      .query("UPDATE products SET name = $2, price_kopecks = $3 WHERE id = $1", [
        jacket.id,
        "Куртка, переименованная после заказа",
        999_999,
      ]);

    const snapshot = await request(buyer, "GET", `/orders/${firstOrder.id}`);
    expect(snapshot.json().order.items).toContainEqual({
      productId: jacket.id,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      quantity: 1,
    });
    expect(snapshot.json().order.totalKopecks).toBe(500_000);
  });

  it("returns existing orders on a repeated checkout with the same clientCheckoutId", async () => {
    const seller = await createUser(1);
    const secondSeller = await createUser(2);
    const buyer = await createUser(3);
    const thirdSeller = await createUser(4);
    await createShop(seller, "first-shop");
    await createShop(secondSeller, "second-shop");
    await createShop(thirdSeller, "third-shop");
    const first = await createPublishedProduct(seller, { name: "Куртка", priceKopecks: 100_000 });
    const second = await createPublishedProduct(secondSeller, {
      name: "Шарф",
      priceKopecks: 50_000,
    });
    const third = await createPublishedProduct(thirdSeller, {
      name: "Сумка",
      priceKopecks: 70_000,
    });
    const clientCheckoutId = randomUUID();

    const created = await checkout(buyer, [first.id, second.id], { clientCheckoutId });
    expect(created.statusCode).toBe(201);
    const createdIds = (created.json().orders as OrderBody[]).map((order) => order.id);

    const repeated = await checkout(buyer, [first.id, second.id], { clientCheckoutId });
    expect(repeated.statusCode).toBe(201);
    expect((repeated.json().orders as OrderBody[]).map((order) => order.id)).toEqual(createdIds);
    expect(await countOrders()).toEqual({ orders: 2, items: 2 });

    // A replay is keyed only by clientCheckoutId: even items from a shop that
    // was absent from the first request return the original orders and never
    // create the third order. This distinguishes the pre-insert replay check
    // from the unique-constraint fallback, which would only catch shops that
    // already have an order for this key.
    const newShopItems = await checkout(buyer, [third.id], { clientCheckoutId });
    expect(newShopItems.statusCode).toBe(201);
    const replayed = newShopItems.json().orders as OrderBody[];
    expect(replayed.map((order) => order.id)).toEqual(createdIds);
    expect(replayed.map((order) => order.shop.slug)).toEqual(["first-shop", "second-shop"]);
    const replayedProductIds = replayed.flatMap((order) =>
      order.items.map((item) => item.productId),
    );
    expect(replayedProductIds.sort((left, right) => (left ?? 0) - (right ?? 0))).toEqual(
      [first.id, second.id].sort((left, right) => left - right),
    );
    expect(await countOrders()).toEqual({ orders: 2, items: 2 });

    const thirdSellerOrders = await request(thirdSeller, "GET", "/seller/orders");
    expect(thirdSellerOrders.statusCode).toBe(200);
    expect(thirdSellerOrders.json()).toEqual({ orders: [] });

    const otherId = await checkout(buyer, [first.id]);
    expect(otherId.statusCode).toBe(201);
    expect(await countOrders()).toEqual({ orders: 3, items: 3 });
  });

  it("handles two concurrent checkouts with the same clientCheckoutId without duplicates", async () => {
    const seller = await createUser(1);
    const buyer = await createUser(2);
    await createShop(seller, "first-shop");
    const product = await createPublishedProduct(seller, {
      name: "Куртка",
      priceKopecks: 100_000,
    });
    const clientCheckoutId = randomUUID();

    const [first, second] = await Promise.all([
      checkout(buyer, [product.id], { clientCheckoutId }),
      checkout(buyer, [product.id], { clientCheckoutId }),
    ]);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((first.json().orders as OrderBody[]).map((order) => order.id)).toEqual(
      (second.json().orders as OrderBody[]).map((order) => order.id),
    );
    expect(await countOrders()).toEqual({ orders: 1, items: 1 });
  });

  it("serializes concurrent same-key checkouts with items from different shops", async () => {
    const firstSeller = await createUser(1);
    const secondSeller = await createUser(2);
    const buyer = await createUser(3);
    await createShop(firstSeller, "first-shop");
    await createShop(secondSeller, "second-shop");
    const firstProduct = await createPublishedProduct(firstSeller, {
      name: "Куртка",
      priceKopecks: 100_000,
    });
    const secondProduct = await createPublishedProduct(secondSeller, {
      name: "Шарф",
      priceKopecks: 50_000,
    });
    const clientCheckoutId = randomUUID();

    // Hold the second product row so that its checkout passes the replay check
    // and then blocks on the row lock. Both requests therefore observe "no
    // existing orders" before either commits — the race the advisory lock must
    // serialize. Without the lock the two requests create one order each.
    const blocker = await dbClient.requirePool().connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [secondProduct.id]);

      const blockedCheckout = checkout(buyer, [secondProduct.id], { clientCheckoutId });
      await waitForLockWaiter("locktype = 'transactionid'");

      const racingCheckout = checkout(buyer, [firstProduct.id], { clientCheckoutId });
      await waitForRacingCheckout();

      await blocker.query("COMMIT");

      const blocked = await blockedCheckout;
      const racing = await racingCheckout;
      expect(blocked.statusCode).toBe(201);
      expect(racing.statusCode).toBe(201);

      const blockedOrders = blocked.json().orders as OrderBody[];
      const racingOrders = racing.json().orders as OrderBody[];
      expect(blockedOrders).toHaveLength(1);
      expect(racingOrders).toHaveLength(1);
      expect(racingOrders).toEqual(blockedOrders);

      const [order] = blockedOrders;
      if (!order) {
        throw new Error("order was not created");
      }
      expect(order.items[0]?.productId).toBe(secondProduct.id);
      expect(await countOrders()).toEqual({ orders: 1, items: 1 });
    } finally {
      blocker.release();
    }
  }, 15_000);

  it("rejects empty, duplicate, oversized and malformed checkouts with 400", async () => {
    const seller = await createUser(1);
    const buyer = await createUser(2);
    await createShop(seller, "first-shop");
    const product = await createPublishedProduct(seller, { name: "Куртка", priceKopecks: 100_000 });

    const invalidPayloads: unknown[] = [
      { items: [], clientCheckoutId: randomUUID() },
      {
        items: [{ productId: product.id }, { productId: product.id }],
        clientCheckoutId: randomUUID(),
      },
      {
        items: Array.from({ length: 51 }, (_, index) => ({ productId: index + 1 })),
        clientCheckoutId: randomUUID(),
      },
      { items: [{ productId: 0 }], clientCheckoutId: randomUUID() },
      { items: [{ productId: product.id }], clientCheckoutId: "not-a-uuid" },
      {
        items: [{ productId: product.id }],
        comment: "a".repeat(501),
        clientCheckoutId: randomUUID(),
      },
      { items: [{ productId: product.id }], comment: "A\u0000B", clientCheckoutId: randomUUID() },
      { items: [{ productId: product.id }] },
    ];

    for (const payload of invalidPayloads) {
      const response = await request(buyer, "POST", "/checkout", payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    expect(await countOrders()).toEqual({ orders: 0, items: 0 });
  });

  it("returns 409 product_unavailable without a partial order", async () => {
    const seller = await createUser(1);
    const buyer = await createUser(2);
    await createShop(seller, "first-shop");
    const available = await createPublishedProduct(seller, {
      name: "Куртка",
      priceKopecks: 100_000,
    });
    const draft = await createProduct(seller, { name: "Черновик", priceKopecks: 50_000 });

    const hiddenProduct = await checkout(buyer, [available.id, draft.id]);
    expect(hiddenProduct.statusCode).toBe(409);
    expect(hiddenProduct.json()).toEqual({ error: "product_unavailable" });
    expect(await countOrders()).toEqual({ orders: 0, items: 0 });

    await updateShop(seller, { status: "draft" });
    const hiddenShop = await checkout(buyer, [available.id]);
    expect(hiddenShop.statusCode).toBe(409);
    expect(hiddenShop.json()).toEqual({ error: "product_unavailable" });
    expect(await countOrders()).toEqual({ orders: 0, items: 0 });

    const missing = await checkout(buyer, [999_999]);
    expect(missing.statusCode).toBe(409);
    expect(missing.json()).toEqual({ error: "product_unavailable" });
  });

  it("limits the buyer to their own orders and returns 404 for foreign orders", async () => {
    const seller = await createUser(1);
    const firstBuyer = await createUser(2);
    const secondBuyer = await createUser(3);
    await createShop(seller, "first-shop");
    const product = await createPublishedProduct(seller, { name: "Куртка", priceKopecks: 100_000 });

    const created = await checkout(firstBuyer, [product.id]);
    expect(created.statusCode).toBe(201);
    const order = (created.json().orders as OrderBody[])[0];
    if (!order) {
      throw new Error("order was not created");
    }

    expect((await request(firstBuyer, "GET", "/orders/mine")).json()).toMatchObject({
      orders: [{ id: order.id }],
    });

    const foreignList = await request(secondBuyer, "GET", "/orders/mine");
    expect(foreignList.statusCode).toBe(200);
    expect(foreignList.json()).toEqual({ orders: [] });

    const foreignDetail = await request(secondBuyer, "GET", `/orders/${order.id}`);
    expect(foreignDetail.statusCode).toBe(404);
    expect(foreignDetail.json()).toEqual({ error: "not_found" });

    const missing = await request(secondBuyer, "GET", "/orders/2147483647");
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "not_found" });
  });

  it("scopes seller orders to the seller's shop and returns an empty list without a shop", async () => {
    const firstSeller = await createUser(1);
    const secondSeller = await createUser(2);
    const buyer = await createUser(3);
    const userWithoutShop = await createUser(4);
    await createShop(firstSeller, "first-shop");
    await createShop(secondSeller, "second-shop");
    const firstProduct = await createPublishedProduct(firstSeller, {
      name: "Куртка",
      priceKopecks: 100_000,
    });
    const secondProduct = await createPublishedProduct(secondSeller, {
      name: "Шарф",
      priceKopecks: 50_000,
    });

    const firstCheckout = await checkout(buyer, [firstProduct.id]);
    const firstOrder = (firstCheckout.json().orders as OrderBody[])[0]!;
    const secondCheckout = await checkout(buyer, [secondProduct.id]);
    const secondOrder = (secondCheckout.json().orders as OrderBody[])[0]!;

    const firstList = await request(firstSeller, "GET", "/seller/orders");
    expect(firstList.statusCode).toBe(200);
    expect((firstList.json().orders as OrderBody[]).map((order) => order.id)).toEqual([
      firstOrder.id,
    ]);

    const secondList = await request(secondSeller, "GET", "/seller/orders");
    expect((secondList.json().orders as OrderBody[]).map((order) => order.id)).toEqual([
      secondOrder.id,
    ]);

    const foreignOrder = await request(firstSeller, "GET", `/seller/orders/${secondOrder.id}`);
    expect(foreignOrder.statusCode).toBe(404);
    expect(foreignOrder.json()).toEqual({ error: "not_found" });

    const noShopList = await request(userWithoutShop, "GET", "/seller/orders");
    expect(noShopList.statusCode).toBe(200);
    expect(noShopList.json()).toEqual({ orders: [] });

    const noShopDetail = await request(userWithoutShop, "GET", `/seller/orders/${firstOrder.id}`);
    expect(noShopDetail.statusCode).toBe(404);

    await dbClient
      .requirePool()
      .query("UPDATE orders SET created_at = $2::timestamptz WHERE id = $1", [
        firstOrder.id,
        "2026-01-01T00:00:00Z",
      ]);
    const secondOrderAgain = await checkout(buyer, [firstProduct.id]);
    const newerOrder = (secondOrderAgain.json().orders as OrderBody[])[0]!;
    await dbClient
      .requirePool()
      .query("UPDATE orders SET created_at = $2::timestamptz WHERE id = $1", [
        newerOrder.id,
        "2026-02-01T00:00:00Z",
      ]);

    const ordered = await request(firstSeller, "GET", "/seller/orders");
    expect((ordered.json().orders as OrderBody[]).map((order) => order.id)).toEqual([
      newerOrder.id,
      firstOrder.id,
    ]);
  });

  it("rate limits checkout after ten requests per user and keeps other users unaffected", async () => {
    const buyer = await createUser(1);
    const otherBuyer = await createUser(2);

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await request(buyer, "POST", "/checkout", {});
      expect(response.statusCode, `attempt ${attempt}`).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    const limited = await request(buyer, "POST", "/checkout", {});
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "rate_limited" });

    const other = await request(otherBuyer, "POST", "/checkout", {});
    expect(other.statusCode).toBe(400);
    expect(await countOrders()).toEqual({ orders: 0, items: 0 });
  });

  it("rejects malformed and out-of-range order ids with 400 and int4 max with 404", async () => {
    const buyer = await createUser(1);

    for (const id of ["not-a-number", "0", "2147483648", "3000000000"]) {
      const response = await request(buyer, "GET", `/orders/${id}`);
      expect(response.statusCode, id).toBe(400);
      expect(response.json()).toEqual({ error: "invalid_request" });
    }

    const maxId = await request(buyer, "GET", "/orders/2147483647");
    expect(maxId.statusCode).toBe(404);
    expect(maxId.json()).toEqual({ error: "not_found" });
  });

  it("keeps the item snapshot with a null productId after the product is deleted", async () => {
    const seller = await createUser(1);
    const buyer = await createUser(2);
    await createShop(seller, "first-shop");
    const product = await createPublishedProduct(seller, { name: "Куртка", priceKopecks: 100_000 });

    const created = await checkout(buyer, [product.id]);
    const order = (created.json().orders as OrderBody[])[0]!;

    await dbClient.requirePool().query("DELETE FROM products WHERE id = $1", [product.id]);

    const detail = await request(buyer, "GET", `/orders/${order.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().order.items).toEqual([
      { productId: null, name: "Куртка", priceKopecks: 100_000, quantity: 1 },
    ]);
  });

  it("sums int4-max item prices into a bigint total without overflowing", async () => {
    const seller = await createUser(1);
    const buyer = await createUser(2);
    await createShop(seller, "first-shop");
    const first = await createPublishedProduct(seller, {
      name: "Максимальная цена",
      priceKopecks: 2_147_483_647,
    });
    const second = await createPublishedProduct(seller, {
      name: "Вторая максимальная цена",
      priceKopecks: 2_147_483_647,
    });

    const response = await checkout(buyer, [first.id, second.id]);
    expect(response.statusCode).toBe(201);

    const parsed = CheckoutResponseSchema.parse(response.json());
    expect(parsed.orders).toHaveLength(1);
    const order = parsed.orders[0]!;
    expect(order.totalKopecks).toBe(4_294_967_294);
    expect(order.items.map((item) => item.priceKopecks)).toEqual([2_147_483_647, 2_147_483_647]);

    const detail = await request(buyer, "GET", `/orders/${order.id}`);
    expect(detail.statusCode).toBe(200);
    expect(OrderResponseSchema.parse(detail.json()).order.totalKopecks).toBe(4_294_967_294);

    const stored = await dbClient.requirePool().query<{
      total: string;
      column_type: string;
    }>(
      `SELECT total_kopecks::text AS total,
              (SELECT data_type FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'total_kopecks') AS column_type
         FROM orders WHERE id = $1`,
      [order.id],
    );
    expect(stored.rows[0]).toEqual({ total: "4294967294", column_type: "bigint" });
  });
});
