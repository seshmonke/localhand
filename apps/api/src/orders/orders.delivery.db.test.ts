import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CheckoutResponseSchema,
  DeliveryQuoteResponseSchema,
  type DeliveryQuoteResponse,
} from "@localhand/shared";
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

function phone(suffix: number): string {
  return `+7999${String(suffix).padStart(7, "0")}`;
}

type TestUser = { id: number; cookie: string };

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

const SHOP_CITY = { cdekCityCode: 44, cdekCityName: "Москва", cdekShipmentPoint: "MSK001" };
const PRODUCT_DIMENSIONS = { weightG: 800, lengthCm: 20, widthCm: 15, heightCm: 10 };

async function createShop(user: TestUser, slug: string): Promise<number> {
  const response = await request(user, "POST", "/seller/shop", {
    name: "Тестовый магазин",
    slug,
  });
  expect(response.statusCode).toBe(201);
  const patch = await request(user, "PATCH", "/seller/shop", SHOP_CITY);
  expect(patch.statusCode).toBe(200);
  return response.json().shop.id as number;
}

async function createPublishedProduct(user: TestUser): Promise<number> {
  const created = await request(user, "POST", "/seller/products", {
    name: "Куртка 90-х",
    priceKopecks: 420_000,
    ...PRODUCT_DIMENSIONS,
  });
  expect(created.statusCode).toBe(201);
  const productId = created.json().product.id as number;

  const shop = await request(user, "PATCH", "/seller/shop", { status: "published" });
  expect(shop.statusCode).toBe(200);
  const published = await request(user, "PATCH", `/seller/products/${productId}`, {
    status: "published",
  });
  expect(published.statusCode).toBe(200);
  return productId;
}

async function quote(productIds: number[]) {
  return request(null, "POST", "/delivery/quote", {
    items: productIds.map((productId) => ({ productId })),
    cityCode: 137,
    pointCode: "SPB001",
  });
}

function deliveryPayload(quoteBody: DeliveryQuoteResponse, recipientName = "Иван Тестов") {
  return {
    cityCode: 137,
    pointCode: "SPB001",
    recipientName,
    quoteToken: quoteBody.quoteToken,
  };
}

describeWithDb("checkout with delivery", () => {
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
    await dbClient
      .requirePool()
      .query(
        "TRUNCATE TABLE delivery_events, order_deliveries, order_items, orders, products, shops, sellers, users, otp_codes CASCADE",
      );
  });

  it("creates a checkout with the paid delivery and returns the snapshot", async () => {
    const seller = await createUser(1);
    await createShop(seller, "checkout-shop");
    const productId = await createPublishedProduct(seller);
    const buyer = await createUser(2);

    const quoted = await quote([productId]);
    expect(quoted.statusCode).toBe(200);
    const quoteBody = quoted.json() as DeliveryQuoteResponse;

    const clientCheckoutId = randomUUID();
    const response = await request(buyer, "POST", "/checkout", {
      items: [{ productId }],
      clientCheckoutId,
      delivery: deliveryPayload(quoteBody),
    });

    expect(response.statusCode).toBe(201);
    const checkout = CheckoutResponseSchema.parse(response.json());
    expect(checkout.orders).toHaveLength(1);
    expect(checkout.orders[0]?.totalKopecks).toBe(458_000);
    expect(checkout.orders[0]?.delivery).toMatchObject({
      provider: "fake",
      status: "quoted",
      cityCode: 137,
      pointCode: "SPB001",
      recipientName: "Иван Тестов",
      priceKopecks: 38_000,
    });

    const replay = await request(buyer, "POST", "/checkout", {
      items: [{ productId }],
      clientCheckoutId,
      delivery: deliveryPayload(quoteBody),
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().orders).toHaveLength(1);
    expect(replay.json().orders[0].totalKopecks).toBe(458_000);
  });

  it("rejects a tampered quote token", async () => {
    const seller = await createUser(1);
    await createShop(seller, "stale-shop");
    const productId = await createPublishedProduct(seller);
    const buyer = await createUser(2);

    const quoted = await quote([productId]);
    const token = quoted.json().quoteToken as string;
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    const response = await request(buyer, "POST", "/checkout", {
      items: [{ productId }],
      clientCheckoutId: randomUUID(),
      delivery: {
        cityCode: 137,
        pointCode: "SPB001",
        recipientName: "Иван Тестов",
        quoteToken: tampered,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "delivery_quote_stale" });
  });

  it("quotes and checks out two shops with separate delivery prices", async () => {
    const firstSeller = await createUser(1);
    const secondSeller = await createUser(2);
    await createShop(firstSeller, "first-quote");
    await createShop(secondSeller, "second-quote");
    const first = await createPublishedProduct(firstSeller);
    const second = await createPublishedProduct(secondSeller);
    const buyer = await createUser(3);

    const quoted = await quote([first, second]);
    expect(quoted.statusCode).toBe(200);
    const body = DeliveryQuoteResponseSchema.parse(quoted.json());
    expect(body.shops).toHaveLength(2);
    expect(new Set(body.shops.map((shop) => shop.shopId)).size).toBe(2);

    const response = await request(buyer, "POST", "/checkout", {
      items: [{ productId: first }, { productId: second }],
      clientCheckoutId: randomUUID(),
      delivery: deliveryPayload(body),
    });
    expect(response.statusCode).toBe(201);
    const checkout = CheckoutResponseSchema.parse(response.json());
    expect(checkout.orders).toHaveLength(2);
    for (const order of checkout.orders) {
      expect(order.delivery?.priceKopecks).toBe(38_000);
      expect(order.totalKopecks).toBe(458_000);
    }
  });
});
