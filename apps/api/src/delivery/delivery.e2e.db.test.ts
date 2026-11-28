import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CheckoutResponseSchema,
  DeliveryQuoteResponseSchema,
  DeliveryResponseSchema,
  DeliveryTariffListResponseSchema,
  SellerDeliveryResponseSchema,
  type DeliveryQuoteResponse,
} from "@localhand/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";
import { resolveFastifyLogger } from "../payments/log-redaction.js";
import type { FakeDeliveryProvider } from "./fake-provider.js";
import type { CreateShipmentInput } from "./provider.js";

/**
 * API/DB end-to-end for the delivery chain (tasks 3.9): quote -> checkout ->
 * paid -> tariffs -> create -> webhook -> track/status, plus the manual
 * fallback after a definitive provider failure, webhook/create idempotency and
 * PII-free logs. Payment itself is a DB fixture here: the payment e2e lives in
 * the payments suite (S3-1), so this file never claims to prove payment.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");
type TestApp = ReturnType<AppModule["buildApp"]>;

let appModule!: AppModule;
let app!: TestApp;
let dbClient!: DbClientModule;
let fakeProvider!: FakeDeliveryProvider;

const SHOP_CITY = { cdekCityCode: 44, cdekCityName: "Москва", cdekShipmentPoint: "MSK001" };
const PRODUCT_DIMENSIONS = { weightG: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };
const RECIPIENT_NAME = "Иван Тестов";
const CHECKOUT_COMMENT = "Комментарий для теста: позвонить за час";
const PVZ_ADDRESS = "Санкт-Петербург, Невский 1";
const ITEMS_KOPECKS = 420_000;
const DELIVERY_KOPECKS = 38_000;
const TOTAL_KOPECKS = ITEMS_KOPECKS + DELIVERY_KOPECKS;

function phone(suffix: number): string {
  return `+7999${String(suffix).padStart(7, "0")}`;
}

type TestUser = { id: number; phone: string; cookie: string };

async function createUser(target: TestApp, index: number): Promise<TestUser> {
  const phoneNumber = phone(index);
  const result = await dbClient
    .requirePool()
    .query<{ id: number }>("INSERT INTO users (phone) VALUES ($1) RETURNING id", [phoneNumber]);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("failed to insert a test user");
  }
  return {
    id,
    phone: phoneNumber,
    cookie: `${SESSION_COOKIE_NAME}=${target.jwt.sign({ sub: id })}`,
  };
}

function request(
  target: TestApp,
  user: TestUser | null,
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload?: unknown,
) {
  return target.inject({
    method,
    url,
    ...(user ? { headers: { cookie: user.cookie } } : {}),
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

async function createPublishedProduct(
  target: TestApp,
  seller: TestUser,
  slug: string,
): Promise<number> {
  const shop = await request(target, seller, "POST", "/seller/shop", {
    name: "Тестовый магазин",
    slug,
  });
  expect(shop.statusCode).toBe(201);
  expect((await request(target, seller, "PATCH", "/seller/shop", SHOP_CITY)).statusCode).toBe(200);

  const created = await request(target, seller, "POST", "/seller/products", {
    name: "Куртка 90-х",
    priceKopecks: ITEMS_KOPECKS,
    ...PRODUCT_DIMENSIONS,
  });
  expect(created.statusCode).toBe(201);
  const productId = created.json().product.id as number;
  expect(
    (await request(target, seller, "PATCH", "/seller/shop", { status: "published" })).statusCode,
  ).toBe(200);
  expect(
    (
      await request(target, seller, "PATCH", `/seller/products/${productId}`, {
        status: "published",
      })
    ).statusCode,
  ).toBe(200);
  return productId;
}

async function quote(target: TestApp, productIds: number[]): Promise<DeliveryQuoteResponse> {
  const response = await request(target, null, "POST", "/delivery/quote", {
    items: productIds.map((productId) => ({ productId })),
    cityCode: 137,
    pointCode: "SPB001",
  });
  expect(response.statusCode).toBe(200);
  return DeliveryQuoteResponseSchema.parse(response.json());
}

type CheckedOutOrder = { seller: TestUser; buyer: TestUser; orderId: number; productId: number };

async function createCheckedOutOrder(
  target: TestApp,
  sellerIndex: number,
  buyerIndex: number,
  slug: string,
): Promise<CheckedOutOrder> {
  const seller = await createUser(target, sellerIndex);
  const buyer = await createUser(target, buyerIndex);
  const productId = await createPublishedProduct(target, seller, slug);
  const quoted = await quote(target, [productId]);

  const checkedOut = await request(target, buyer, "POST", "/checkout", {
    items: [{ productId }],
    clientCheckoutId: randomUUID(),
    comment: CHECKOUT_COMMENT,
    delivery: {
      cityCode: 137,
      pointCode: "SPB001",
      recipientName: RECIPIENT_NAME,
      quoteToken: quoted.quoteToken,
    },
  });
  expect(checkedOut.statusCode).toBe(201);
  const checkout = CheckoutResponseSchema.parse(checkedOut.json());
  const order = checkout.orders[0];
  if (!order) {
    throw new Error("checkout did not create an order");
  }
  expect(order.totalKopecks).toBe(TOTAL_KOPECKS);
  expect(order.delivery).toMatchObject({
    provider: "fake",
    status: "quoted",
    cityCode: 137,
    pointCode: "SPB001",
    recipientName: RECIPIENT_NAME,
    priceKopecks: DELIVERY_KOPECKS,
  });
  return { seller, buyer, orderId: order.id, productId };
}

/** Payment is out of scope here (S3-1): a direct fixture status transition. */
async function markOrderPaid(orderId: number): Promise<void> {
  await dbClient.requirePool().query("UPDATE orders SET status = 'paid' WHERE id = $1", [orderId]);
}

async function deliveryRow(orderId: number) {
  const result = await dbClient.requirePool().query<{
    status: string;
    provider_order_id: string | null;
    provider_number: string | null;
    track_number: string | null;
    carrier: string | null;
    price_kopecks: string;
  }>(
    `SELECT status, provider_order_id, provider_number, track_number, carrier, price_kopecks
       FROM order_deliveries WHERE order_id = $1`,
    [orderId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("delivery row missing");
  }
  return row;
}

async function countDeliveryEvents(orderId: number): Promise<number> {
  const result = await dbClient.requirePool().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM delivery_events
        WHERE delivery_id IN (SELECT id FROM order_deliveries WHERE order_id = $1)`,
    [orderId],
  );
  return result.rows[0]?.count ?? -1;
}

async function countDeliveries(): Promise<number> {
  const result = await dbClient
    .requirePool()
    .query<{ count: number }>("SELECT count(*)::int AS count FROM order_deliveries");
  return result.rows[0]?.count ?? -1;
}

describeWithDb("delivery API/DB e2e", () => {
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
    const factory = await import("./provider-factory.js");
    const provider = factory.getDeliveryProvider();
    if (!provider || provider.name !== "fake") {
      throw new Error("delivery e2e requires the fake delivery provider");
    }
    fakeProvider = provider as FakeDeliveryProvider;
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

  it("runs quote -> checkout -> paid -> tariffs -> create -> webhook -> delivered", async () => {
    const order = await createCheckedOutOrder(app, 1, 2, "e2e-chain-shop");

    const stored = await dbClient
      .requirePool()
      .query<{ status: string; delivery_kopecks: string; total_kopecks: string }>(
        "SELECT status, delivery_kopecks, total_kopecks FROM orders WHERE id = $1",
        [order.orderId],
      );
    expect(stored.rows[0]?.status).toBe("new");
    expect(Number(stored.rows[0]?.delivery_kopecks)).toBe(DELIVERY_KOPECKS);
    expect(Number(stored.rows[0]?.total_kopecks)).toBe(TOTAL_KOPECKS);
    expect((await deliveryRow(order.orderId)).status).toBe("quoted");

    await markOrderPaid(order.orderId);

    const tariffs = await request(
      app,
      order.seller,
      "GET",
      `/seller/orders/${order.orderId}/delivery/tariffs`,
    );
    expect(tariffs.statusCode).toBe(200);
    const tariffsBody = DeliveryTariffListResponseSchema.parse(tariffs.json());
    expect(tariffsBody.paid).toEqual({ tariffCode: "136", priceKopecks: DELIVERY_KOPECKS });
    expect(tariffsBody.tariffs[0]).toMatchObject({
      tariffCode: "136",
      priceKopecks: DELIVERY_KOPECKS,
    });

    const created = await request(
      app,
      order.seller,
      "POST",
      `/seller/orders/${order.orderId}/delivery`,
      { tariffCode: "136" },
    );
    expect(created.statusCode).toBe(201);
    const createdDelivery = DeliveryResponseSchema.parse(created.json()).delivery;
    expect(createdDelivery).toMatchObject({
      provider: "fake",
      status: "created",
      providerOrderId: `fake-${order.orderId}`,
      providerNumber: `order-${order.orderId}`,
    });
    const createdRow = await deliveryRow(order.orderId);
    expect(createdRow).toMatchObject({
      status: "created",
      provider_order_id: `fake-${order.orderId}`,
      provider_number: `order-${order.orderId}`,
    });
    expect(Number(createdRow.price_kopecks)).toBe(DELIVERY_KOPECKS);
    expect(await countDeliveryEvents(order.orderId)).toBe(1);

    const uuid = `fake-${order.orderId}`;
    const webhook = {
      type: "ORDER_STATUS" as const,
      uuid,
      attributes: { number: `order-${order.orderId}` },
    };
    fakeProvider.setShipmentStatus(uuid, "DELIVERED", "Вручён");
    expect((await request(app, null, "POST", "/delivery/cdek/webhook", webhook)).statusCode).toBe(
      200,
    );

    const buyerView = await request(app, order.buyer, "GET", `/orders/${order.orderId}/delivery`);
    expect(buyerView.statusCode).toBe(200);
    expect(buyerView.headers["cache-control"]).toBe("no-store");
    const buyerDelivery = DeliveryResponseSchema.parse(buyerView.json()).delivery;
    expect(buyerDelivery).toMatchObject({
      status: "delivered",
      lastStatusCode: "DELIVERED",
      providerNumber: `order-${order.orderId}`,
      trackNumber: null,
    });

    const sellerView = await request(
      app,
      order.seller,
      "GET",
      `/seller/orders/${order.orderId}/delivery`,
    );
    expect(sellerView.statusCode).toBe(200);
    const sellerBody = SellerDeliveryResponseSchema.parse(sellerView.json());
    expect(sellerBody.delivery.status).toBe(buyerDelivery.status);
    expect(sellerBody.delivery.lastStatusCode).toBe(buyerDelivery.lastStatusCode);
    expect(sellerBody.delivery.providerNumber).toBe(buyerDelivery.providerNumber);
    expect(sellerBody.delivery.trackNumber).toBe(buyerDelivery.trackNumber);
    expect(sellerBody.events.map((event) => event.statusCode)).toEqual(["DELIVERED", "CREATED"]);

    expect((await request(app, null, "POST", "/delivery/cdek/webhook", webhook)).statusCode).toBe(
      200,
    );
    expect(await countDeliveryEvents(order.orderId)).toBe(2);

    const originalCreate = fakeProvider.createShipment;
    let createCalls = 0;
    fakeProvider.createShipment = async (input: CreateShipmentInput) => {
      createCalls += 1;
      return originalCreate(input);
    };
    try {
      const repeated = await request(
        app,
        order.seller,
        "POST",
        `/seller/orders/${order.orderId}/delivery`,
        { tariffCode: "136" },
      );
      expect(repeated.statusCode).toBe(201);
      const repeatedDelivery = DeliveryResponseSchema.parse(repeated.json()).delivery;
      expect(repeatedDelivery.providerOrderId).toBe(uuid);
      expect(repeatedDelivery.providerNumber).toBe(`order-${order.orderId}`);
      expect(repeatedDelivery.status).toBe("delivered");
      expect(createCalls).toBe(0);
    } finally {
      fakeProvider.createShipment = originalCreate;
    }
    expect(await countDeliveries()).toBe(1);
    expect(await countDeliveryEvents(order.orderId)).toBe(2);
    const finalRow = await deliveryRow(order.orderId);
    expect(finalRow).toMatchObject({
      status: "delivered",
      provider_number: `order-${order.orderId}`,
    });
  });

  it("falls back to a manual track after a definitive provider failure", async () => {
    const order = await createCheckedOutOrder(app, 3, 4, "e2e-manual-shop");
    await markOrderPaid(order.orderId);

    const originalCreate = fakeProvider.createShipment;
    fakeProvider.createShipment = async () => {
      // A definitive 4xx-style rejection: the provider has no order to adopt.
      throw new Error("definitive_provider_reject");
    };
    try {
      const failed = await request(
        app,
        order.seller,
        "POST",
        `/seller/orders/${order.orderId}/delivery`,
        { tariffCode: "136" },
      );
      expect(failed.statusCode).toBe(502);
      expect(failed.json()).toEqual({ error: "delivery_provider_error" });
    } finally {
      fakeProvider.createShipment = originalCreate;
    }

    const afterFailure = await deliveryRow(order.orderId);
    expect(afterFailure).toMatchObject({ status: "quoted", provider_order_id: null });
    expect(await countDeliveryEvents(order.orderId)).toBe(0);
    expect(await countDeliveries()).toBe(1);

    const manual = await request(
      app,
      order.seller,
      "PATCH",
      `/seller/orders/${order.orderId}/delivery`,
      { carrier: "Почта России", trackNumber: "MANUAL-E2E-1" },
    );
    expect(manual.statusCode).toBe(200);
    expect(DeliveryResponseSchema.parse(manual.json()).delivery).toMatchObject({
      status: "manual",
      carrier: "Почта России",
      trackNumber: "MANUAL-E2E-1",
      providerOrderId: null,
    });

    const buyerView = await request(app, order.buyer, "GET", `/orders/${order.orderId}/delivery`);
    expect(buyerView.statusCode).toBe(200);
    expect(DeliveryResponseSchema.parse(buyerView.json()).delivery).toMatchObject({
      status: "manual",
      carrier: "Почта России",
      trackNumber: "MANUAL-E2E-1",
    });
    const sellerView = await request(
      app,
      order.seller,
      "GET",
      `/seller/orders/${order.orderId}/delivery`,
    );
    expect(sellerView.statusCode).toBe(200);
    const sellerBody = SellerDeliveryResponseSchema.parse(sellerView.json());
    expect(sellerBody.delivery.trackNumber).toBe("MANUAL-E2E-1");
    expect(sellerBody.events.map((event) => event.statusCode)).toEqual(["MANUAL"]);

    const repeated = await request(
      app,
      order.seller,
      "PATCH",
      `/seller/orders/${order.orderId}/delivery`,
      { carrier: "Почта России", trackNumber: "MANUAL-E2E-2" },
    );
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json()).toEqual({ error: "delivery_already_exists" });
    const finalRow = await deliveryRow(order.orderId);
    expect(finalRow.track_number).toBe("MANUAL-E2E-1");
    expect(finalRow.provider_order_id).toBeNull();
  });

  it("keeps recipient PII and payload hashes out of the log stream", async () => {
    const lines: string[] = [];
    const stream = {
      write(line: string) {
        lines.push(line);
      },
    };
    const productionLogger = resolveFastifyLogger("production", undefined);
    if (typeof productionLogger !== "object" || productionLogger === null) {
      throw new Error("expected logger options");
    }
    const logApp = appModule.buildApp({
      logger: { ...productionLogger, level: "info", stream },
    });
    await logApp.ready();

    const order = await createCheckedOutOrder(logApp, 5, 6, "e2e-logs-shop");
    const failedOrder = await createCheckedOutOrder(logApp, 7, 8, "e2e-logs-fail-shop");
    try {
      await markOrderPaid(order.orderId);
      expect(
        (
          await request(logApp, order.seller, "POST", `/seller/orders/${order.orderId}/delivery`, {
            tariffCode: "136",
          })
        ).statusCode,
      ).toBe(201);

      fakeProvider.setShipmentStatus(`fake-${order.orderId}`, "DELIVERED", "Вручён");
      expect(
        (
          await request(logApp, null, "POST", "/delivery/cdek/webhook", {
            type: "ORDER_STATUS",
            uuid: `fake-${order.orderId}`,
            attributes: { number: `order-${order.orderId}` },
          })
        ).statusCode,
      ).toBe(200);

      await markOrderPaid(failedOrder.orderId);
      const originalCreate = fakeProvider.createShipment;
      fakeProvider.createShipment = async () => {
        throw new Error(`rejected ${RECIPIENT_NAME} ${failedOrder.buyer.phone} ${PVZ_ADDRESS}`);
      };
      try {
        expect(
          (
            await request(
              logApp,
              failedOrder.seller,
              "POST",
              `/seller/orders/${failedOrder.orderId}/delivery`,
              { tariffCode: "136" },
            )
          ).statusCode,
        ).toBe(502);
      } finally {
        fakeProvider.createShipment = originalCreate;
      }

      const originalGet = fakeProvider.getShipment;
      fakeProvider.getShipment = async () => {
        throw new Error(`verify failed for ${RECIPIENT_NAME} ${order.buyer.phone}`);
      };
      try {
        expect(
          (
            await request(logApp, null, "POST", "/delivery/cdek/webhook", {
              type: "ORDER_STATUS",
              uuid: `fake-${order.orderId}`,
              attributes: { number: `order-${order.orderId}` },
            })
          ).statusCode,
        ).toBe(502);
      } finally {
        fakeProvider.getShipment = originalGet;
      }
    } finally {
      await logApp.close();
    }

    const output = lines.join("\n");
    // Positive control: the logger captured real request/route lines.
    expect(output).toContain("delivery quote");
    expect(output).toContain(`/seller/orders/${order.orderId}/delivery`);
    expect(output).toContain("/checkout");
    expect(output).toContain("/delivery/cdek/webhook");
    expect(output).not.toContain(RECIPIENT_NAME);
    expect(output).not.toContain(order.buyer.phone.slice(1));
    expect(output).not.toContain(failedOrder.buyer.phone.slice(1));
    expect(output).not.toContain(PVZ_ADDRESS);
    expect(output).not.toContain(CHECKOUT_COMMENT);
    expect(output).not.toMatch(/payload_?hash/i);
  });
});
