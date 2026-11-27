import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type DbClientModule = typeof import("./client.js");

let dbClient!: DbClientModule;

async function columns(table: string): Promise<Map<string, string>> {
  const result = await dbClient.requirePool().query<{
    column_name: string;
    is_nullable: string;
  }>(
    `SELECT column_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Map(result.rows.map((row) => [row.column_name, row.is_nullable]));
}

type Fixtures = {
  orderId: number;
  deliveryId: number;
};

async function insertFixtures(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<Fixtures> {
  const phone = `test-${randomUUID()}`;
  const user = await client.query("INSERT INTO users (phone) VALUES ($1) RETURNING id", [phone]);
  const userId = user.rows[0]?.id as number;
  const seller = await client.query(
    "INSERT INTO sellers (display_name, user_id) VALUES ($1, $2) RETURNING id",
    ["Тестовый продавец", userId],
  );
  const sellerId = seller.rows[0]?.id as number;
  const shop = await client.query(
    "INSERT INTO shops (seller_id, slug, name, status) VALUES ($1, $2, $3, 'published') RETURNING id",
    [sellerId, `test-shop-${randomUUID().slice(0, 8)}`, "Тестовый магазин"],
  );
  const shopId = shop.rows[0]?.id as number;
  const order = await client.query(
    `INSERT INTO orders (buyer_user_id, shop_id, total_kopecks, buyer_phone, client_checkout_id)
     VALUES ($1, $2, 100000, $3, $4) RETURNING id`,
    [userId, shopId, phone, randomUUID()],
  );
  const orderId = order.rows[0]?.id as number;
  const delivery = await client.query(
    `INSERT INTO order_deliveries
       (order_id, provider, city_code, city_name, point_code, point_address,
        recipient_name, recipient_phone, provider_tariff_code, tariff_name,
        price_kopecks, period_min, period_max)
     VALUES ($1, 'cdek', 44, 'Москва', 'MSK001', 'Москва, Тверская 1',
             'Иван Тестов', $2, '136', 'Посылка', 35000, 2, 4)
     RETURNING id`,
    [orderId, phone],
  );
  return { orderId, deliveryId: delivery.rows[0]?.id as number };
}

describeWithDb("delivery schema migration 0006", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("./client.js");

    const database = await dbClient
      .requirePool()
      .query<{ name: string }>("SELECT current_database() AS name");
    if (!database.rows[0]?.name.endsWith("_test")) {
      throw new Error("delivery DB tests require a database whose name ends with _test");
    }

    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });
  });

  afterAll(async () => {
    await dbClient?.requirePool().end();
  });

  it("adds product dimensions and shop shipping fields", async () => {
    const productColumns = await columns("products");
    for (const column of ["weight_g", "length_cm", "width_cm", "height_cm"]) {
      expect(productColumns.get(column)).toBe("YES");
    }

    const shopColumns = await columns("shops");
    for (const column of ["cdek_city_code", "cdek_city_name", "cdek_shipment_point"]) {
      expect(shopColumns.get(column)).toBe("YES");
    }

    const orderColumns = await columns("orders");
    expect(orderColumns.get("delivery_kopecks")).toBe("NO");
  });

  it("creates order_deliveries and delivery_events with idempotency keys", async () => {
    const deliveryColumns = await columns("order_deliveries");
    for (const column of [
      "order_id",
      "provider",
      "status",
      "city_code",
      "point_code",
      "recipient_name",
      "recipient_phone",
      "provider_tariff_code",
      "price_kopecks",
      "provider_order_id",
      "provider_number",
      "track_number",
      "last_status_code",
    ]) {
      expect(deliveryColumns.has(column), column).toBe(true);
    }

    const eventColumns = await columns("delivery_events");
    for (const column of [
      "delivery_id",
      "status_code",
      "status_name",
      "occurred_at",
      "payload_hash",
    ]) {
      expect(eventColumns.has(column), column).toBe(true);
    }

    const constraints = await dbClient.requirePool().query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conrelid IN ('order_deliveries'::regclass, 'delivery_events'::regclass)`,
    );
    const names = constraints.rows.map((row) => row.conname);
    expect(names).toContain("order_deliveries_order_id_unique");
    expect(names).toContain("delivery_events_delivery_status_occurred_unique");
    expect(names).toContain("order_deliveries_provider_check");
  });

  it("enforces non-negative delivery money and positive dimensions", async () => {
    const constraints = await dbClient.requirePool().query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conrelid IN ('orders'::regclass, 'products'::regclass, 'order_deliveries'::regclass)`,
    );
    const names = constraints.rows.map((row) => row.conname);
    expect(names).toContain("orders_delivery_kopecks_check");
    expect(names).toContain("products_weight_g_check");
    expect(names).toContain("order_deliveries_price_kopecks_check");
  });

  it("rejects a duplicate delivery event and cascades on order delete", async () => {
    const client = await dbClient.requirePool().connect();
    try {
      await client.query("BEGIN");
      const fixtures = await insertFixtures(client);
      const occurredAt = "2026-11-27T16:00:00.000Z";
      await client.query(
        `INSERT INTO delivery_events (delivery_id, status_code, status_name, occurred_at, payload_hash)
         VALUES ($1, 'CREATED', 'Создан', $2, 'hash')`,
        [fixtures.deliveryId, occurredAt],
      );

      await client.query("SAVEPOINT duplicate_event");
      await expect(
        client.query(
          `INSERT INTO delivery_events (delivery_id, status_code, status_name, occurred_at, payload_hash)
           VALUES ($1, 'CREATED', 'Создан', $2, 'hash')`,
          [fixtures.deliveryId, occurredAt],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate_event");

      await client.query("DELETE FROM orders WHERE id = $1", [fixtures.orderId]);
      const deliveries = await client.query("SELECT id FROM order_deliveries WHERE order_id = $1", [
        fixtures.orderId,
      ]);
      const events = await client.query("SELECT id FROM delivery_events WHERE delivery_id = $1", [
        fixtures.deliveryId,
      ]);
      expect(deliveries.rows).toEqual([]);
      expect(events.rows).toEqual([]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("allows many null provider ids but rejects duplicates", async () => {
    const client = await dbClient.requirePool().connect();
    try {
      await client.query("BEGIN");
      const first = await insertFixtures(client);
      const second = await insertFixtures(client);
      const nullIds = await client.query(
        `SELECT count(*)::int AS count FROM order_deliveries
          WHERE provider_order_id IS NULL AND id = ANY($1::int[])`,
        [[first.deliveryId, second.deliveryId]],
      );
      expect(nullIds.rows[0]?.count).toBe(2);
      await client.query(
        "UPDATE order_deliveries SET provider_order_id = 'provider-1' WHERE id = $1",
        [first.deliveryId],
      );
      await client.query("SAVEPOINT duplicate_provider_id");
      await expect(
        client.query("UPDATE order_deliveries SET provider_order_id = 'provider-1' WHERE id = $1", [
          second.deliveryId,
        ]),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate_provider_id");

      await client.query(
        "UPDATE order_deliveries SET provider_order_id = 'provider-2' WHERE id = $1",
        [second.deliveryId],
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
