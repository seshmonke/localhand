import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;

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

describeWithDb("delivery schema migration 0006", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("./client.js");
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
});
