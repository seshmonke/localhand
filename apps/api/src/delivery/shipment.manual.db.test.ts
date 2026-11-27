import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DeliveryResponseSchema } from "@localhand/shared";
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

async function createOrderWithSnapshot(): Promise<{ userId: number; orderId: number }> {
  const pool = dbClient.requirePool();
  const suffix = randomUUID().slice(0, 8);
  const user = await pool.query<{ id: number }>(
    "INSERT INTO users (phone) VALUES ($1) RETURNING id",
    [`test-${suffix}`],
  );
  const userId = user.rows[0]?.id as number;
  const seller = await pool.query<{ id: number }>(
    "INSERT INTO sellers (display_name, user_id) VALUES ($1, $2) RETURNING id",
    ["Тестовый продавец", userId],
  );
  const sellerId = seller.rows[0]?.id as number;
  const shop = await pool.query<{ id: number }>(
    `INSERT INTO shops (seller_id, slug, name, status, cdek_city_code, cdek_city_name, cdek_shipment_point)
     VALUES ($1, $2, $3, 'published', 44, 'Москва', 'MSK001') RETURNING id`,
    [sellerId, `manual-${suffix}`, "Тестовый магазин"],
  );
  const shopId = shop.rows[0]?.id as number;
  const order = await pool.query<{ id: number }>(
    `INSERT INTO orders (buyer_user_id, shop_id, status, total_kopecks, delivery_kopecks, buyer_phone, client_checkout_id)
     VALUES ($1, $2, 'paid', 458000, 38000, $3, $4) RETURNING id`,
    [userId, shopId, `test-${suffix}`, randomUUID()],
  );
  const orderId = order.rows[0]?.id as number;
  await pool.query(
    `INSERT INTO order_deliveries
       (order_id, provider, status, city_code, city_name, point_code, point_address,
        recipient_name, recipient_phone, provider_tariff_code, tariff_name,
        price_kopecks, period_min, period_max)
     VALUES ($1, 'manual', 'quoted', 137, 'Санкт-Петербург', 'SPB001', 'Санкт-Петербург, Невский 1',
             'Иван Тестов', $2, '136', 'Посылка', 38000, 2, 4)`,
    [orderId, "test-recipient"],
  );
  return { userId, orderId };
}

describeWithDb("manual delivery provider", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.DELIVERY_PROVIDER = "manual";
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

  it("saves a manual track for a paid order without a CDEK provider", async () => {
    const { userId, orderId } = await createOrderWithSnapshot();
    const cookie = `${SESSION_COOKIE_NAME}=${app.jwt.sign({ sub: userId })}`;
    const response = await app.inject({
      method: "PATCH",
      url: `/seller/orders/${orderId}/delivery`,
      headers: { cookie },
      payload: { carrier: "Почта России", trackNumber: "LEGACY-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(DeliveryResponseSchema.parse(response.json()).delivery).toMatchObject({
      provider: "manual",
      status: "manual",
      carrier: "Почта России",
      trackNumber: "LEGACY-1",
    });
  });
});
