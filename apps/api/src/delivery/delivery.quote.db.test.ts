import { fileURLToPath } from "node:url";
import { DeliveryQuoteResponseSchema } from "@localhand/shared";
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

async function createShop(user: TestUser, slug: string, shipping = true): Promise<number> {
  const response = await request(user, "POST", "/seller/shop", {
    name: "Тестовый магазин",
    slug,
  });
  expect(response.statusCode).toBe(201);
  const shopId = response.json().shop.id as number;

  if (shipping) {
    const patch = await request(user, "PATCH", "/seller/shop", SHOP_CITY);
    expect(patch.statusCode).toBe(200);
  }
  return shopId;
}

async function createPublishedProduct(
  user: TestUser,
  payload: Record<string, unknown> = PRODUCT_DIMENSIONS,
): Promise<number> {
  const created = await request(user, "POST", "/seller/products", {
    name: "Куртка 90-х",
    priceKopecks: 420_000,
    ...payload,
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

async function quote(productId: number, cityCode = 137, pointCode = "SPB001") {
  return request(null, "POST", "/delivery/quote", {
    items: [{ productId }],
    cityCode,
    pointCode,
  });
}

describeWithDb("delivery quote and checkout", () => {
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

  it("suggests cities and points", async () => {
    const cities = await request(null, "GET", "/delivery/cities?query=моск");
    expect(cities.statusCode).toBe(200);
    expect(cities.json().cities).toEqual([{ code: 44, name: "Москва" }]);

    const points = await request(null, "GET", "/delivery/points?cityCode=44");
    expect(points.statusCode).toBe(200);
    expect(points.json().points).toContainEqual(
      expect.objectContaining({ code: "MSK001", cityCode: 44 }),
    );
  });

  it("returns a signed per-shop quote with price and period", async () => {
    const seller = await createUser(1);
    await createShop(seller, "quote-shop");
    const productId = await createPublishedProduct(seller);

    const response = await quote(productId);
    expect(response.statusCode).toBe(200);
    const body = DeliveryQuoteResponseSchema.parse(response.json());
    expect(body.shops).toHaveLength(1);
    expect(body.shops[0]?.priceKopecks).toBe(38_000);
    expect(body.quoteToken.length).toBeGreaterThan(20);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a PVZ outside the requested city", async () => {
    const seller = await createUser(1);
    await createShop(seller, "point-shop");
    const productId = await createPublishedProduct(seller);

    const response = await quote(productId, 137, "MSK001");
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "delivery_point_invalid" });
  });

  it("rejects products without dimensions or a shop origin", async () => {
    const seller = await createUser(1);
    await createShop(seller, "no-sizing");
    const productId = await createPublishedProduct(seller, { weightG: null });

    const noDimensions = await quote(productId);
    expect(noDimensions.statusCode).toBe(409);
    expect(noDimensions.json()).toEqual({ error: "delivery_dimensions_missing" });

    await request(seller, "PATCH", `/seller/products/${productId}`, PRODUCT_DIMENSIONS);
    await request(seller, "PATCH", "/seller/shop", {
      cdekCityCode: null,
      cdekCityName: null,
      cdekShipmentPoint: null,
    });
    const noCity = await quote(productId);
    expect(noCity.statusCode).toBe(409);
    expect(noCity.json()).toEqual({ error: "shop_city_missing" });
  });
});
