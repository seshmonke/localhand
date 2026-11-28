import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CheckoutResponseSchema,
  DeliveryResponseSchema,
  DeliveryTariffListResponseSchema,
  SellerDeliveryResponseSchema,
} from "@localhand/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";
import type { FakeDeliveryProvider } from "./fake-provider.js";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");

let appModule!: AppModule;
let app!: ReturnType<AppModule["buildApp"]>;
let dbClient!: DbClientModule;

type TestUser = { id: number; cookie: string };

function phone(suffix: number): string {
  return `+7999${String(suffix).padStart(7, "0")}`;
}

async function createUser(index: number): Promise<TestUser> {
  const result = await dbClient
    .requirePool()
    .query<{ id: number }>("INSERT INTO users (phone) VALUES ($1) RETURNING id", [phone(index)]);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test user");
  }
  return { id, cookie: `${SESSION_COOKIE_NAME}=${app.jwt.sign({ sub: id })}` };
}

function request(
  user: TestUser | null,
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    ...(user ? { headers: { cookie: user.cookie } } : {}),
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

type PaidOrder = { seller: TestUser; buyer: TestUser; orderId: number; productId: number };

async function createPaidOrder(
  sellerIndex: number,
  buyerIndex: number,
  slug: string,
): Promise<PaidOrder> {
  const seller = await createUser(sellerIndex);
  const buyer = await createUser(buyerIndex);

  const shop = await request(seller, "POST", "/seller/shop", {
    name: "Тестовый магазин",
    slug,
  });
  expect(shop.statusCode).toBe(201);
  expect(
    (
      await request(seller, "PATCH", "/seller/shop", {
        cdekCityCode: 44,
        cdekCityName: "Москва",
        cdekShipmentPoint: "MSK001",
      })
    ).statusCode,
  ).toBe(200);

  const created = await request(seller, "POST", "/seller/products", {
    name: "Куртка 90-х",
    priceKopecks: 420_000,
    weightG: 800,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
  });
  const productId = created.json().product.id as number;
  expect((await request(seller, "PATCH", "/seller/shop", { status: "published" })).statusCode).toBe(
    200,
  );
  expect(
    (await request(seller, "PATCH", `/seller/products/${productId}`, { status: "published" }))
      .statusCode,
  ).toBe(200);

  const quoted = await request(null, "POST", "/delivery/quote", {
    items: [{ productId }],
    cityCode: 137,
    pointCode: "SPB001",
  });
  expect(quoted.statusCode).toBe(200);

  const checkedOut = await request(buyer, "POST", "/checkout", {
    items: [{ productId }],
    clientCheckoutId: randomUUID(),
    delivery: {
      cityCode: 137,
      pointCode: "SPB001",
      recipientName: "Иван Тестов",
      quoteToken: quoted.json().quoteToken as string,
    },
  });
  expect(checkedOut.statusCode).toBe(201);
  const orderId = CheckoutResponseSchema.parse(checkedOut.json()).orders[0]?.id as number;

  await dbClient.requirePool().query("UPDATE orders SET status = 'paid' WHERE id = $1", [orderId]);

  return { seller, buyer, orderId, productId };
}

describeWithDb("delivery shipment routes", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.DELIVERY_PROVIDER = "fake";
    process.env.DELIVERY_ENV = "test";
    process.env.DELIVERY_QUOTE_SECRET = "s3-delivery-quote-secret-9Qm2Vx7Lp4Rt8Wc1";
    dbClient = await import("../db/client.js");
    const database = await dbClient
      .requirePool()
      .query<{ name: string }>("SELECT current_database() AS name");
    if (!database.rows[0]?.name.endsWith("_test")) {
      throw new Error("delivery DB tests require a database whose name ends with _test");
    }
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });

    appModule = await import("../app.js");
    app = appModule.buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await dbClient?.requirePool().end();
    delete process.env.DELIVERY_PROVIDER;
    delete process.env.DELIVERY_ENV;
    delete process.env.DELIVERY_QUOTE_SECRET;
  });

  beforeEach(async () => {
    await dbClient
      .requirePool()
      .query(
        "TRUNCATE TABLE delivery_events, order_deliveries, order_items, orders, products, shops, sellers, users, otp_codes CASCADE",
      );
  });

  it("lists the paid tariff and creates a shipment idempotently", async () => {
    const order = await createPaidOrder(1, 2, "shipment-shop");

    const tariffs = await request(
      order.seller,
      "GET",
      `/seller/orders/${order.orderId}/delivery/tariffs`,
    );
    expect(tariffs.statusCode).toBe(200);
    const tariffBody = DeliveryTariffListResponseSchema.parse(tariffs.json());
    expect(tariffBody.paid.priceKopecks).toBe(38_000);
    expect(tariffBody.tariffs[0]).toMatchObject({ shopId: expect.any(Number) });

    const created = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      {
        tariffCode: "136",
      },
    );
    expect(created.statusCode).toBe(201);
    const delivery = DeliveryResponseSchema.parse(created.json()).delivery;
    expect(delivery).toMatchObject({
      provider: "fake",
      status: "created",
      providerOrderId: `fake-${order.orderId}`,
      providerNumber: `order-${order.orderId}`,
    });

    const repeated = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      { tariffCode: "136" },
    );
    expect(repeated.statusCode).toBe(201);
    expect(DeliveryResponseSchema.parse(repeated.json()).delivery.providerOrderId).toBe(
      delivery.providerOrderId,
    );

    const buyerView = await request(order.buyer, "GET", `/orders/${order.orderId}/delivery`);
    expect(buyerView.statusCode).toBe(200);
    expect(DeliveryResponseSchema.parse(buyerView.json()).delivery.status).toBe("created");
  });

  it("rejects an unpaid order and a foreign seller", async () => {
    const order = await createPaidOrder(1, 2, "unpaid-shop");
    await dbClient
      .requirePool()
      .query("UPDATE orders SET status = 'new' WHERE id = $1", [order.orderId]);

    const unpaid = await request(order.seller, "POST", `/seller/orders/${order.orderId}/delivery`, {
      tariffCode: "136",
    });
    expect(unpaid.statusCode).toBe(409);
    expect(unpaid.json()).toEqual({ error: "delivery_not_paid" });

    await dbClient
      .requirePool()
      .query("UPDATE orders SET status = 'paid' WHERE id = $1", [order.orderId]);
    const otherSeller = await createUser(3);
    const foreign = await request(otherSeller, "GET", `/seller/orders/${order.orderId}/delivery`);
    expect(foreign.statusCode).toBe(404);
  });

  it("serializes concurrent creates into one shipment", async () => {
    const order = await createPaidOrder(1, 2, "concurrent-shop");
    const [first, second] = await Promise.all([
      request(order.seller, "POST", `/seller/orders/${order.orderId}/delivery`, {
        tariffCode: "136",
      }),
      request(order.seller, "POST", `/seller/orders/${order.orderId}/delivery`, {
        tariffCode: "136",
      }),
    ]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(DeliveryResponseSchema.parse(first.json()).delivery.providerOrderId).toBe(
      DeliveryResponseSchema.parse(second.json()).delivery.providerOrderId,
    );
    const rows = await dbClient
      .requirePool()
      .query<{ count: number }>(
        "SELECT count(*)::int AS count FROM order_deliveries WHERE order_id = $1",
        [order.orderId],
      );
    expect(rows.rows[0]?.count).toBe(1);
  });

  it("adopts a remote CDEK order after a local timeout instead of creating a duplicate", async () => {
    const order = await createPaidOrder(1, 2, "adopt-shop");
    const created = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      {
        tariffCode: "136",
      },
    );
    expect(created.statusCode).toBe(201);

    await dbClient.requirePool().query(
      `UPDATE order_deliveries
            SET provider_order_id = NULL, provider_number = NULL, status = 'quoted'
          WHERE order_id = $1`,
      [order.orderId],
    );

    const retried = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      { tariffCode: "136" },
    );
    expect(retried.statusCode).toBe(201);
    expect(DeliveryResponseSchema.parse(retried.json()).delivery.providerOrderId).toBe(
      `fake-${order.orderId}`,
    );
  });

  it("rejects manual track after a CDEK shipment and allows legacy manual", async () => {
    const order = await createPaidOrder(1, 2, "legacy-shop");
    const created = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      {
        tariffCode: "136",
      },
    );
    expect(created.statusCode).toBe(201);

    const afterCdek = await request(
      order.seller,
      "PATCH",
      `/seller/orders/${order.orderId}/delivery`,
      { carrier: "СДЭК", trackNumber: "1234567890" },
    );
    expect(afterCdek.statusCode).toBe(409);
    expect(afterCdek.json()).toEqual({ error: "delivery_already_exists" });

    const legacyOrder = await createPaidOrder(3, 4, "legacy-only-shop");
    await dbClient
      .requirePool()
      .query("DELETE FROM order_deliveries WHERE order_id = $1", [legacyOrder.orderId]);
    const legacy = await request(
      legacyOrder.seller,
      "PATCH",
      `/seller/orders/${legacyOrder.orderId}/delivery`,
      { carrier: "Почта России", trackNumber: "LEGACY-1" },
    );
    expect(legacy.statusCode).toBe(200);
    expect(DeliveryResponseSchema.parse(legacy.json()).delivery).toMatchObject({
      provider: "manual",
      status: "manual",
      cityCode: 0,
      carrier: "Почта России",
      trackNumber: "LEGACY-1",
    });
  });

  it("rejects a CDEK create after a manual track", async () => {
    const order = await createPaidOrder(1, 2, "manual-first-shop");
    const manual = await request(
      order.seller,
      "PATCH",
      `/seller/orders/${order.orderId}/delivery`,
      {
        carrier: "Почта России",
        trackNumber: "MANUAL-1",
      },
    );
    expect(manual.statusCode).toBe(200);

    const create = await request(order.seller, "POST", `/seller/orders/${order.orderId}/delivery`, {
      tariffCode: "136",
    });
    expect(create.statusCode).toBe(409);
    expect(create.json()).toEqual({ error: "delivery_already_exists" });
  });

  it("rejects a tariff different from the paid one", async () => {
    const order = await createPaidOrder(1, 2, "tariff-shop");
    const response = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      { tariffCode: "999" },
    );
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "delivery_tariff_mismatch" });
  });

  it("saves a manual track and hides it from another buyer", async () => {
    const order = await createPaidOrder(1, 2, "manual-shop");
    const saved = await request(order.seller, "PATCH", `/seller/orders/${order.orderId}/delivery`, {
      carrier: "СДЭК",
      trackNumber: "1234567890",
    });
    expect(saved.statusCode).toBe(200);
    expect(DeliveryResponseSchema.parse(saved.json()).delivery).toMatchObject({
      provider: "fake",
      status: "manual",
      carrier: "СДЭК",
      trackNumber: "1234567890",
    });

    const repeated = await request(
      order.seller,
      "PATCH",
      `/seller/orders/${order.orderId}/delivery`,
      { carrier: "СДЭК", trackNumber: "9999999999" },
    );
    expect(repeated.statusCode).toBe(409);

    const otherBuyer = await createUser(4);
    const foreign = await request(otherBuyer, "GET", `/orders/${order.orderId}/delivery`);
    expect(foreign.statusCode).toBe(404);
  });

  it("deduplicates webhooks, rejects spoofed numbers and keeps the latest status", async () => {
    const order = await createPaidOrder(1, 2, "webhook-replay-shop");
    const created = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      {
        tariffCode: "136",
      },
    );
    expect(created.statusCode).toBe(201);
    const uuid = `fake-${order.orderId}`;
    const { getDeliveryProvider } = await import("./provider-factory.js");
    const provider = getDeliveryProvider() as FakeDeliveryProvider;

    const event = {
      type: "ORDER_STATUS" as const,
      uuid,
      attributes: { number: `order-${order.orderId}` },
    };
    expect((await request(null, "POST", "/delivery/cdek/webhook", event)).statusCode).toBe(200);
    expect((await request(null, "POST", "/delivery/cdek/webhook", event)).statusCode).toBe(200);
    const events = await dbClient
      .requirePool()
      .query<{ count: number }>(
        "SELECT count(*)::int AS count FROM delivery_events WHERE status_code = 'CREATED'",
      );
    expect(events.rows[0]?.count).toBe(1);

    const spoof = await request(null, "POST", "/delivery/cdek/webhook", {
      ...event,
      attributes: { number: "another-order" },
    });
    expect(spoof.statusCode).toBe(404);

    provider.setShipmentStatus(uuid, "DELIVERED", "Вручён");
    expect((await request(null, "POST", "/delivery/cdek/webhook", event)).statusCode).toBe(200);
    provider.setShipmentStatus(uuid, "CREATED", "Создан");
    expect((await request(null, "POST", "/delivery/cdek/webhook", event)).statusCode).toBe(200);

    const delivery = await request(order.buyer, "GET", `/orders/${order.orderId}/delivery`);
    expect(DeliveryResponseSchema.parse(delivery.json()).delivery.status).toBe("delivered");
    const createdEvents = await dbClient
      .requirePool()
      .query<{ count: number }>(
        "SELECT count(*)::int AS count FROM delivery_events WHERE status_code = 'CREATED'",
      );
    expect(createdEvents.rows[0]?.count).toBe(1);
  });

  it("does not write an event when a stale same-rank webhook is ignored", async () => {
    const order = await createPaidOrder(1, 2, "stale-webhook-shop");
    const created = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      {
        tariffCode: "136",
      },
    );
    expect(created.statusCode).toBe(201);
    const uuid = `fake-${order.orderId}`;
    const { getDeliveryProvider } = await import("./provider-factory.js");
    const provider = getDeliveryProvider() as FakeDeliveryProvider;
    const body = { type: "ORDER_STATUS" as const, uuid };

    provider.setShipmentStatus(uuid, "DELIVERED", "Вручён", "2030-01-01T00:00:00.000Z");
    expect((await request(null, "POST", "/delivery/cdek/webhook", body)).statusCode).toBe(200);

    const before = await dbClient
      .requirePool()
      .query<{ count: number }>("SELECT count(*)::int AS count FROM delivery_events");
    provider.setShipmentStatus(uuid, "DELIVERED", "Вручён", "2020-01-01T00:00:00.000Z");
    expect((await request(null, "POST", "/delivery/cdek/webhook", body)).statusCode).toBe(200);
    const after = await dbClient
      .requirePool()
      .query<{ count: number }>("SELECT count(*)::int AS count FROM delivery_events");
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("sets no-store and rejects a foreign seller create", async () => {
    const order = await createPaidOrder(1, 2, "headers-shop");
    const otherSeller = await createUser(3);
    const foreign = await request(otherSeller, "POST", `/seller/orders/${order.orderId}/delivery`, {
      tariffCode: "136",
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.headers["cache-control"]).toBe("no-store");
  });

  it("accepts a verified webhook and rejects an unknown order", async () => {
    const order = await createPaidOrder(1, 2, "webhook-shop");
    const created = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      {
        tariffCode: "136",
      },
    );
    expect(created.statusCode).toBe(201);

    const webhook = await request(null, "POST", "/delivery/cdek/webhook", {
      type: "ORDER_STATUS",
      uuid: `fake-${order.orderId}`,
      attributes: { number: `order-${order.orderId}` },
    });
    expect(webhook.statusCode).toBe(200);

    const events = await dbClient
      .requirePool()
      .query<{ count: number }>("SELECT count(*)::int AS count FROM delivery_events");
    expect(events.rows[0]?.count).toBeGreaterThan(0);

    const unknown = await request(null, "POST", "/delivery/cdek/webhook", {
      type: "ORDER_STATUS",
      uuid: "00000000-0000-4000-8000-000000000000",
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("returns the seller delivery with newest-first events and no internal fields", async () => {
    const order = await createPaidOrder(1, 2, "events-shop");
    const created = await request(
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      { tariffCode: "136" },
    );
    expect(created.statusCode).toBe(201);
    expect(Object.keys(created.json())).toEqual(["delivery"]);

    const { getDeliveryProvider } = await import("./provider-factory.js");
    const provider = getDeliveryProvider() as FakeDeliveryProvider;
    provider.setShipmentStatus(`fake-${order.orderId}`, "DELIVERED", "Вручён");
    expect(
      (
        await request(null, "POST", "/delivery/cdek/webhook", {
          type: "ORDER_STATUS",
          uuid: `fake-${order.orderId}`,
          attributes: { number: `order-${order.orderId}` },
        })
      ).statusCode,
    ).toBe(200);

    const response = await request(order.seller, "GET", `/seller/orders/${order.orderId}/delivery`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = SellerDeliveryResponseSchema.parse(response.json());
    expect(body.delivery.providerOrderId).toBe(`fake-${order.orderId}`);
    expect(body.events.map((event) => event.statusCode)).toEqual(["DELIVERED", "CREATED"]);
    expect(body.events[0]?.statusName).toBe("Вручён");
    for (const event of body.events) {
      expect(Object.keys(event)).toEqual(["statusCode", "statusName", "occurredAt"]);
    }
    const raw = JSON.stringify(response.json());
    expect(raw).not.toMatch(/payload_?hash/i);
  });

  it("returns an empty event list for a quoted delivery", async () => {
    const order = await createPaidOrder(1, 2, "empty-events-shop");
    const response = await request(order.seller, "GET", `/seller/orders/${order.orderId}/delivery`);
    expect(response.statusCode).toBe(200);
    const body = SellerDeliveryResponseSchema.parse(response.json());
    expect(body.delivery.status).toBe("quoted");
    expect(body.events).toEqual([]);
  });

  it("requires a session and keeps 404 for legacy orders without delivery", async () => {
    const order = await createPaidOrder(1, 2, "events-authz-shop");
    const anonymous = await request(null, "GET", `/seller/orders/${order.orderId}/delivery`);
    expect(anonymous.statusCode).toBe(401);

    await dbClient
      .requirePool()
      .query("DELETE FROM order_deliveries WHERE order_id = $1", [order.orderId]);
    const legacy = await request(order.seller, "GET", `/seller/orders/${order.orderId}/delivery`);
    expect(legacy.statusCode).toBe(404);
  });

  it("returns the last 50 events ordered by occurred_at and id descending", async () => {
    const order = await createPaidOrder(1, 2, "events-limit-shop");
    const delivery = await dbClient
      .requirePool()
      .query<{ id: number }>("SELECT id FROM order_deliveries WHERE order_id = $1", [
        order.orderId,
      ]);
    const deliveryId = delivery.rows[0]?.id;
    expect(deliveryId).toBeDefined();

    await dbClient.requirePool().query(
      `INSERT INTO delivery_events (delivery_id, status_code, status_name, occurred_at, payload_hash)
       SELECT $1::int, 'EVT-' || g, 'Событие ' || g,
              timestamptz '2026-01-01 00:00:00+00' + (g || ' seconds')::interval,
              'hash-' || g
       FROM generate_series(1, 55) AS g
       UNION ALL
       SELECT $1::int, 'EVT-SAME', 'Событие рядом', timestamptz '2026-01-01 00:00:55+00', 'hash-same'`,
      [deliveryId],
    );

    const response = await request(order.seller, "GET", `/seller/orders/${order.orderId}/delivery`);
    expect(response.statusCode).toBe(200);
    const body = SellerDeliveryResponseSchema.parse(response.json());
    expect(body.events).toHaveLength(50);
    expect(body.events[0]?.statusCode).toBe("EVT-SAME");
    expect(body.events[1]?.statusCode).toBe("EVT-55");
    expect(body.events.at(-1)?.statusCode).toBe("EVT-7");
  });
});
