import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
import type { CreateShipmentInput, ShipmentState } from "./provider.js";

/**
 * API/DB end-to-end for the delivery chain (tasks 3.9): quote -> checkout ->
 * paid -> tariffs -> create -> webhook -> track/status, manual fallback after
 * a definitive provider failure including its remote-lookup guards, and
 * webhook/create idempotency. Payment is a DB fixture here (S3-1 owns payment
 * e2e), so this file never claims to prove payment.
 */
const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");
type TestApp = ReturnType<AppModule["buildApp"]>;
type TestUser = { id: number; phone: string; cookie: string };
type OrderRef = { seller: TestUser; orderId: number };

let appModule!: AppModule;
let app!: TestApp;
let dbClient!: DbClientModule;
let fakeProvider!: FakeDeliveryProvider;

const SHOP_CITY = { cdekCityCode: 44, cdekCityName: "Москва", cdekShipmentPoint: "MSK001" };
const DIMENSIONS = { weightG: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };
const RECIPIENT_NAME = "Иван Тестов";
const CHECKOUT_COMMENT = "Комментарий для теста: позвонить за час";
const PVZ_ADDRESS = "Санкт-Петербург, Невский 1";
const ITEMS_KOPECKS = 420_000;
const DELIVERY_KOPECKS = 38_000;
const TOTAL_KOPECKS = ITEMS_KOPECKS + DELIVERY_KOPECKS;

function phone(suffix: number): string {
  return `+7999${String(suffix).padStart(7, "0")}`;
}
async function createUser(target: TestApp, index: number): Promise<TestUser> {
  // SQL fixture: auth is covered elsewhere, so a session cookie is signed directly.
  const phoneNumber = phone(index);
  const result = await dbClient
    .requirePool()
    .query<{ id: number }>("INSERT INTO users (phone) VALUES ($1) RETURNING id", [phoneNumber]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("failed to insert a test user");
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
async function createPublishedProduct(target: TestApp, seller: TestUser, slug: string) {
  const shop = await request(target, seller, "POST", "/seller/shop", {
    name: "Тестовый магазин",
    slug,
  });
  expect(shop.statusCode).toBe(201);
  expect((await request(target, seller, "PATCH", "/seller/shop", SHOP_CITY)).statusCode).toBe(200);
  const created = await request(target, seller, "POST", "/seller/products", {
    name: "Куртка 90-х",
    priceKopecks: ITEMS_KOPECKS,
    ...DIMENSIONS,
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

async function createCheckedOutOrder(
  target: TestApp,
  sellerIndex: number,
  buyerIndex: number,
  slug: string,
): Promise<OrderRef & { buyer: TestUser }> {
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
  if (!order) throw new Error("checkout did not create an order");
  expect(order.totalKopecks).toBe(TOTAL_KOPECKS);
  expect(order.delivery).toMatchObject({
    provider: "fake",
    status: "quoted",
    cityCode: 137,
    pointCode: "SPB001",
    recipientName: RECIPIENT_NAME,
    priceKopecks: DELIVERY_KOPECKS,
  });
  return { seller, buyer, orderId: order.id };
}

/** Payment is out of scope here (S3-1): a direct fixture status transition. */
async function markOrderPaid(orderId: number): Promise<void> {
  await dbClient.requirePool().query("UPDATE orders SET status = 'paid' WHERE id = $1", [orderId]);
}

function postShipment(target: TestApp, order: OrderRef, tariffCode = "136") {
  return request(target, order.seller, "POST", `/seller/orders/${order.orderId}/delivery`, {
    tariffCode,
  });
}

function patchManual(target: TestApp, order: OrderRef, trackNumber: string) {
  return request(target, order.seller, "PATCH", `/seller/orders/${order.orderId}/delivery`, {
    carrier: "Почта России",
    trackNumber,
  });
}

function postWebhook(target: TestApp, orderId: number) {
  return request(target, null, "POST", "/delivery/cdek/webhook", {
    type: "ORDER_STATUS" as const,
    uuid: `fake-${orderId}`,
    attributes: { number: `order-${orderId}` },
  });
}

function getSellerDelivery(target: TestApp, order: OrderRef) {
  return request(target, order.seller, "GET", `/seller/orders/${order.orderId}/delivery`);
}

type DeliveryRow = {
  status: string;
  provider_order_id: string | null;
  provider_number: string | null;
  track_number: string | null;
  carrier: string | null;
  price_kopecks: string;
};

async function deliveryRow(orderId: number): Promise<DeliveryRow> {
  const result = await dbClient
    .requirePool()
    .query<DeliveryRow>("SELECT * FROM order_deliveries WHERE order_id = $1", [orderId]);
  const row = result.rows[0];
  if (!row) throw new Error("delivery row missing");
  return row;
}

async function countRows(table: "order_deliveries" | "delivery_events", orderId?: number) {
  const filter =
    orderId === undefined
      ? ""
      : " WHERE delivery_id IN (SELECT id FROM order_deliveries WHERE order_id = $1)";
  const { rows } = await dbClient
    .requirePool()
    .query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table}${filter}`,
      orderId === undefined ? [] : [orderId],
    );
  return rows[0]?.count ?? -1;
}

async function expectManualUntouched(orderId: number, deliveries: number): Promise<void> {
  expect(await deliveryRow(orderId)).toMatchObject({
    status: "quoted",
    provider_order_id: null,
    track_number: null,
    carrier: null,
  });
  expect(await countRows("delivery_events", orderId)).toBe(0);
  expect(await countRows("order_deliveries")).toBe(deliveries);
}

const LOG_LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);
const PII_FIELDS =
  /recipientName|recipientPhone|buyerPhone|pointAddress|address|comment|payload_?hash|request\.body/i;
const ALLOWED_KEYS = new Set([
  "code",
  "delivery_id",
  "order_id",
  "provider",
  "status",
  "reason",
  "err",
  "shops",
  "durationMs",
  "error",
]);

type LogCall = { method: string; args: string };
/** Finds every `log.<method>(...)` call and extracts its raw argument list. */
function logCalls(source: string): LogCall[] {
  return [...source.matchAll(/\b(?:logger|log)\.([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)].map(
    (match) => ({
      method: match[1] ?? "",
      args: match[2] ?? "",
    }),
  );
}
/** Top-level keys of the first object literal in a log call, if any. */
function payloadKeys(args: string): string[] {
  const object = /^\s*\{([\s\S]*?)\}\s*(?:,|$)/.exec(args);
  if (!object?.[1]) return [];
  return [...object[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map(
    (match) => match[1] ?? "",
  );
}

const LOG_SOURCES = [
  "delivery.route.ts",
  "shipment.route.ts",
  "shipment.service.ts",
  "delivery.service.ts",
  "delivery.reconcile.ts",
  "delivery.reconcile.scheduler.ts",
].map((file) => ({ file, source: readFileSync(new URL(file, import.meta.url), "utf8") }));

describe("delivery logging source audit", () => {
  it("never logs PII fields or request bodies from delivery code and keeps the route error to a code", () => {
    for (const { file, source } of LOG_SOURCES) {
      expect(source, file).not.toMatch(/console\.(?:log|info|warn|error|debug|trace)/);
      for (const call of logCalls(source)) {
        expect(
          LOG_LEVELS.has(call.method) || call.method === "child",
          `${file} ${call.method}`,
        ).toBe(true);
        expect(call.args, `${file} ${call.method}`).not.toMatch(PII_FIELDS);
        for (const key of payloadKeys(call.args)) {
          expect(ALLOWED_KEYS.has(key), `${file} ${key}`).toBe(true);
        }
      }
    }
    const routeSource = readFileSync(new URL("./shipment.route.ts", import.meta.url), "utf8");
    const errorCalls = logCalls(routeSource).filter((call) => call.method === "error");
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.args).toMatch(
      /^\s*\{ code: error\.code \?\? "internal_error" \}\s*,\s*"delivery shipment failed"\s*$/,
    );
  });
});

describeWithDb("delivery API/DB e2e", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return;
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
    delete process.env.DATABASE_URL;
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

    const created = await postShipment(app, order);
    expect(created.statusCode).toBe(201);
    expect(DeliveryResponseSchema.parse(created.json()).delivery).toMatchObject({
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
    expect(await countRows("delivery_events", order.orderId)).toBe(1);

    fakeProvider.setShipmentStatus(`fake-${order.orderId}`, "DELIVERED", "Вручён");
    expect((await postWebhook(app, order.orderId)).statusCode).toBe(200);
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

    const sellerView = await getSellerDelivery(app, order);
    expect(sellerView.statusCode).toBe(200);
    const sellerBody = SellerDeliveryResponseSchema.parse(sellerView.json());
    expect(sellerBody.delivery.status).toBe(buyerDelivery.status);
    expect(sellerBody.delivery.lastStatusCode).toBe(buyerDelivery.lastStatusCode);
    expect(sellerBody.delivery.providerNumber).toBe(buyerDelivery.providerNumber);
    expect(sellerBody.delivery.trackNumber).toBe(buyerDelivery.trackNumber);
    expect(sellerBody.events.map((event) => event.statusCode)).toEqual(["DELIVERED", "CREATED"]);

    expect((await postWebhook(app, order.orderId)).statusCode).toBe(200);
    expect(await countRows("delivery_events", order.orderId)).toBe(2);

    const originalCreate = fakeProvider.createShipment;
    let createCalls = 0;
    fakeProvider.createShipment = async (input: CreateShipmentInput) => {
      createCalls += 1;
      return originalCreate(input);
    };
    try {
      const repeated = await postShipment(app, order);
      expect(repeated.statusCode).toBe(201);
      const repeatedDelivery = DeliveryResponseSchema.parse(repeated.json()).delivery;
      expect(repeatedDelivery.providerOrderId).toBe(`fake-${order.orderId}`);
      expect(repeatedDelivery.providerNumber).toBe(`order-${order.orderId}`);
      expect(repeatedDelivery.status).toBe("delivered");
      expect(createCalls).toBe(0);
    } finally {
      fakeProvider.createShipment = originalCreate;
    }
    expect(await countRows("order_deliveries")).toBe(1);
    expect(await countRows("delivery_events", order.orderId)).toBe(2);
    expect(await deliveryRow(order.orderId)).toMatchObject({
      status: "delivered",
      provider_number: `order-${order.orderId}`,
    });
  });

  it("allows manual after a definitive create failure when the remote lookup is explicitly null", async () => {
    const order = await createCheckedOutOrder(app, 3, 4, "e2e-manual-shop");
    await markOrderPaid(order.orderId);
    const originalCreate = fakeProvider.createShipment;
    fakeProvider.createShipment = async () => {
      // A definitive 4xx-style rejection: the provider has no order to adopt.
      throw new Error("definitive_provider_reject");
    };
    try {
      const failed = await postShipment(app, order);
      expect(failed.statusCode).toBe(502);
      expect(failed.json()).toEqual({ error: "delivery_provider_error" });
    } finally {
      fakeProvider.createShipment = originalCreate;
    }
    await expectManualUntouched(order.orderId, 1);

    const originalFind = fakeProvider.findShipmentByNumber;
    fakeProvider.findShipmentByNumber = async (): Promise<ShipmentState | null> => null;
    try {
      const manual = await patchManual(app, order, "MANUAL-E2E-1");
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
      const sellerView = await getSellerDelivery(app, order);
      expect(sellerView.statusCode).toBe(200);
      const sellerBody = SellerDeliveryResponseSchema.parse(sellerView.json());
      expect(sellerBody.delivery.trackNumber).toBe("MANUAL-E2E-1");
      expect(sellerBody.events.map((event) => event.statusCode)).toEqual(["MANUAL"]);

      const repeated = await patchManual(app, order, "MANUAL-E2E-2");
      expect(repeated.statusCode).toBe(409);
      expect(repeated.json()).toEqual({ error: "delivery_already_exists" });
    } finally {
      fakeProvider.findShipmentByNumber = originalFind;
    }
    const finalRow = await deliveryRow(order.orderId);
    expect(finalRow.track_number).toBe("MANUAL-E2E-1");
    expect(finalRow.provider_order_id).toBeNull();
  });

  it("blocks manual when the remote lookup fails or a remote shipment exists", async () => {
    const lookupFails = await createCheckedOutOrder(app, 5, 6, "e2e-manual-lookup-fail");
    await markOrderPaid(lookupFails.orderId);
    const originalFind = fakeProvider.findShipmentByNumber;
    fakeProvider.findShipmentByNumber = async () => {
      throw new Error("provider_lookup_timeout");
    };
    try {
      const failed = await patchManual(app, lookupFails, "MANUAL-GUARD-1");
      expect(failed.statusCode).toBe(502);
      expect(failed.json()).toEqual({ error: "delivery_provider_error" });
    } finally {
      fakeProvider.findShipmentByNumber = originalFind;
    }
    await expectManualUntouched(lookupFails.orderId, 1);

    const remoteExists = await createCheckedOutOrder(app, 7, 8, "e2e-manual-remote");
    await markOrderPaid(remoteExists.orderId);
    fakeProvider.findShipmentByNumber = async (number: string): Promise<ShipmentState> => ({
      providerOrderId: `remote-${number}`,
      statusCode: "CREATED",
      statusName: "Создан",
      trackNumber: null,
      statusDateTime: new Date().toISOString(),
    });
    try {
      const blocked = await patchManual(app, remoteExists, "MANUAL-GUARD-2");
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toEqual({ error: "delivery_already_exists" });
    } finally {
      fakeProvider.findShipmentByNumber = originalFind;
    }
    await expectManualUntouched(remoteExists.orderId, 2);
  });

  it("keeps recipient PII and payload hashes out of info/warn/error logs", async () => {
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
    const logApp = appModule.buildApp({ logger: { ...productionLogger, level: "info", stream } });
    await logApp.ready();

    const order = await createCheckedOutOrder(logApp, 9, 10, "e2e-logs-shop");
    const failedOrder = await createCheckedOutOrder(logApp, 11, 12, "e2e-logs-fail-shop");
    try {
      await markOrderPaid(order.orderId);
      expect((await postShipment(logApp, order)).statusCode).toBe(201);
      fakeProvider.setShipmentStatus(`fake-${order.orderId}`, "DELIVERED", "Вручён");
      expect((await postWebhook(logApp, order.orderId)).statusCode).toBe(200);

      await markOrderPaid(failedOrder.orderId);
      const originalCreate = fakeProvider.createShipment;
      fakeProvider.createShipment = async () => {
        throw new Error(`rejected ${RECIPIENT_NAME} ${failedOrder.buyer.phone} ${PVZ_ADDRESS}`);
      };
      try {
        expect((await postShipment(logApp, failedOrder)).statusCode).toBe(502);
      } finally {
        fakeProvider.createShipment = originalCreate;
      }

      const originalGet = fakeProvider.getShipment;
      fakeProvider.getShipment = async () => {
        throw new Error(`verify failed for ${RECIPIENT_NAME} ${order.buyer.phone}`);
      };
      try {
        expect((await postWebhook(logApp, order.orderId)).statusCode).toBe(502);
      } finally {
        fakeProvider.getShipment = originalGet;
      }

      // Force a 500 through the shipment route error handler and audit its log.
      await dbClient
        .requirePool()
        .query("ALTER TABLE order_deliveries RENAME TO order_deliveries_e2e_broken");
      try {
        const broken = await getSellerDelivery(logApp, order);
        expect(broken.statusCode).toBe(500);
        expect(broken.json()).toEqual({ error: "internal_error" });
      } finally {
        await dbClient
          .requirePool()
          .query("ALTER TABLE order_deliveries_e2e_broken RENAME TO order_deliveries");
      }
    } finally {
      await logApp.close();
    }

    const output = lines.join("\n");
    // Positive control: the logger captured request, route and error lines.
    expect(output).toContain("delivery quote");
    expect(output).toContain(`/seller/orders/${order.orderId}/delivery`);
    expect(output).toContain("/checkout");
    expect(output).toContain("/delivery/cdek/webhook");
    const errorLine = lines.find((line) => line.includes("delivery shipment failed"));
    expect(errorLine).toBeDefined();
    expect(errorLine).toMatch(/"code":"[a-z0-9_]+"/i);
    expect(output).not.toContain(RECIPIENT_NAME);
    expect(output).not.toContain(order.buyer.phone.slice(1));
    expect(output).not.toContain(failedOrder.buyer.phone.slice(1));
    expect(output).not.toContain(PVZ_ADDRESS);
    expect(output).not.toContain(CHECKOUT_COMMENT);
    expect(output).not.toMatch(/payload_?hash/i);
  });
});
