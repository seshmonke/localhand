import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryProvider, ShipmentState } from "./provider.js";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type DbClientModule = typeof import("../db/client.js");
type ReconcileModule = typeof import("./delivery.reconcile.js");
let dbClient!: DbClientModule;
let reconcile!: ReconcileModule;
let orderIds: number[] = [];
let nextOrder = 0;

const NOW = new Date("2026-11-28T12:00:00.000Z");
const STALE = { lastStatusAt: new Date(NOW.getTime() - 5 * 60_000) };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const pool = () => dbClient.requirePool();

function stubProvider() {
  const shipments = new Map<string, ShipmentState>();
  const calls: string[] = [];
  const provider = {
    name: "fake" as const,
    shipments,
    calls,
    async getShipment(id: string): Promise<ShipmentState | null> {
      calls.push(id);
      return shipments.get(id) ?? null;
    },
  };
  return provider as unknown as DeliveryProvider & typeof provider;
}

async function createDelivery(input: {
  status: "created" | "in_transit" | "quoted" | "manual";
  providerOrderId: string;
  lastStatusAt: Date;
}): Promise<number> {
  const orderId = orderIds[nextOrder];
  nextOrder += 1;
  if (!orderId) {
    throw new Error("the fixture batch has no free order");
  }
  const result = await pool().query<{ id: number }>(
    `INSERT INTO order_deliveries
       (order_id, provider, status, city_code, city_name, point_code, point_address,
        recipient_name, recipient_phone, price_kopecks, provider_order_id,
        last_status_at, updated_at)
     VALUES ($1, 'fake', $2, 137, 'Санкт-Петербург', 'SPB001', 'Невский 1',
       'Иван Тестов', '0000000000', 38000, $3, $4, now())
     RETURNING id`,
    [orderId, input.status, input.providerOrderId, input.lastStatusAt],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("delivery fixture missing");
  }
  return id;
}

async function fixture(
  status: "created" | "in_transit" | "quoted" | "manual",
  providerOrderId: string,
  lastStatusAt = STALE.lastStatusAt,
): Promise<number> {
  return createDelivery({ status, providerOrderId, lastStatusAt });
}

async function deliveryRow(deliveryId: number) {
  const result = await pool().query<{
    status: string;
    track_number: string | null;
    last_status_code: string | null;
  }>("SELECT status, track_number, last_status_code FROM order_deliveries WHERE id = $1", [
    deliveryId,
  ]);
  const row = result.rows[0];
  if (!row) {
    throw new Error("delivery row missing");
  }
  return row;
}

async function eventCodes(deliveryId: number): Promise<string[]> {
  const result = await pool().query<{ status_code: string }>(
    "SELECT status_code FROM delivery_events WHERE delivery_id = $1 ORDER BY id",
    [deliveryId],
  );
  return result.rows.map((row) => row.status_code);
}

function shipment(
  statusCode: string,
  statusName: string,
  statusDateTime: Date,
  trackNumber: string | null = null,
): ShipmentState {
  return {
    providerOrderId: null,
    statusCode,
    statusName,
    trackNumber,
    statusDateTime: statusDateTime.toISOString(),
  };
}

describeWithDb("delivery reconcile core", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    reconcile = await import("./delivery.reconcile.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });
    await pool().query(
      "TRUNCATE TABLE delivery_events, order_deliveries, order_items, orders, products, shops, sellers, users, otp_codes CASCADE",
    );
    // One buyer per spare order: order_deliveries.order_id is unique.
    const fixtures = await pool().query<{ id: number }>(
      `WITH buyers AS (
         INSERT INTO users (phone)
         SELECT '+7999' || lpad(i::text, 7, '0') FROM generate_series(1, 3) AS i
         RETURNING id
       ), seller AS (
         INSERT INTO sellers (display_name) VALUES ('Иван Тестов') RETURNING id
       ), shop AS (
         INSERT INTO shops (seller_id, slug, name, status)
         SELECT id, 'reconcile-shop', 'Тестовый магазин', 'published' FROM seller RETURNING id
       )
       INSERT INTO orders (buyer_user_id, shop_id, status, total_kopecks, buyer_phone, client_checkout_id)
       SELECT buyers.id, shop.id, 'paid', 458000, '+7999', gen_random_uuid() FROM buyers, shop
       RETURNING id`,
    );
    orderIds = fixtures.rows.map((row) => row.id);
  });

  afterAll(async () => {
    await pool().end();
  });

  beforeEach(async () => {
    await pool().query("TRUNCATE TABLE delivery_events, order_deliveries CASCADE");
    nextOrder = 0;
  });

  it("applies delivered and track for a stale delivery without duplicating the event", async () => {
    const deliveryId = await fixture("created", "remote-1");
    const provider = stubProvider();
    provider.shipments.set(
      "remote-1",
      shipment("DELIVERED", "Вручён", new Date(NOW.getTime() - 60_000), "TRACK-1"),
    );

    await reconcile.runDeliveryReconcile(provider, log, NOW);

    expect(await deliveryRow(deliveryId)).toMatchObject({
      status: "delivered",
      track_number: "TRACK-1",
      last_status_code: "DELIVERED",
    });
    expect(await eventCodes(deliveryId)).toEqual(["DELIVERED"]);

    await reconcile.runDeliveryReconcile(provider, log, new Date(NOW.getTime() + 5 * 60_000));
    expect(await eventCodes(deliveryId)).toEqual(["DELIVERED"]);
  });

  it("does not poll fresh, quoted or manual deliveries", async () => {
    const fresh = await fixture("in_transit", "fresh-1", new Date(NOW.getTime() - 30_000));
    const quoted = await fixture("quoted", "quoted-1");
    const manual = await fixture("manual", "manual-1");
    const provider = stubProvider();
    for (const id of ["fresh-1", "quoted-1", "manual-1"]) {
      provider.shipments.set(id, shipment("DELIVERED", "Вручён", NOW));
    }

    await reconcile.runDeliveryReconcile(provider, log, NOW);

    expect(provider.calls).toEqual([]);
    expect((await deliveryRow(fresh)).status).toBe("in_transit");
    expect((await deliveryRow(quoted)).status).toBe("quoted");
    expect((await deliveryRow(manual)).status).toBe("manual");
  });

  it("stores an unknown provider code as in_transit and keeps the raw code", async () => {
    const deliveryId = await fixture("created", "remote-unknown");
    const provider = stubProvider();
    provider.shipments.set(
      "remote-unknown",
      shipment("SOMETHING_NEW", "Новый скан", new Date(NOW.getTime() - 60_000)),
    );

    await reconcile.runDeliveryReconcile(provider, log, NOW);

    expect(await deliveryRow(deliveryId)).toMatchObject({
      status: "in_transit",
      last_status_code: "SOMETHING_NEW",
    });
    expect(await eventCodes(deliveryId)).toEqual(["SOMETHING_NEW"]);
  });
});
