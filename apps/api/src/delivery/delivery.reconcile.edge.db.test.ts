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
const STALE = new Date(NOW.getTime() - 5 * 60_000);
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const pool = () => dbClient.requirePool();

function stubProvider() {
  const shipments = new Map<string, ShipmentState>();
  const calls: string[] = [];
  const provider = {
    name: "fake" as const,
    shipments,
    calls,
    fail: new Set<string>(),
    onCall: null as null | (() => void),
    async getShipment(id: string): Promise<ShipmentState | null> {
      calls.push(id);
      provider.onCall?.();
      if (provider.fail.has(id)) {
        throw new Error("provider down");
      }
      return shipments.get(id) ?? null;
    },
  };
  return provider as unknown as DeliveryProvider & typeof provider;
}

async function createDelivery(status: string, providerOrderId: string, lastStatusAt = STALE) {
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
    [orderId, status, providerOrderId, lastStatusAt],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("delivery fixture missing");
  }
  return id;
}

async function stateOf(deliveryId: number) {
  const result = await pool().query<{ status: string; events: number }>(
    `SELECT d.status, (SELECT count(*)::int FROM delivery_events e WHERE e.delivery_id = d.id) AS events
     FROM order_deliveries d WHERE d.id = $1`,
    [deliveryId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("delivery row missing");
  }
  return row;
}

function shipment(
  statusCode: string,
  statusName: string,
  at: Date,
  trackNumber: string | null = null,
) {
  return {
    providerOrderId: null,
    statusCode,
    statusName,
    trackNumber,
    statusDateTime: at.toISOString(),
  } satisfies ShipmentState;
}

describeWithDb("delivery reconcile edge cases", () => {
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
    const fixtures = await pool().query<{ id: number }>(
      `WITH buyers AS (
         INSERT INTO users (phone)
         SELECT '+7999' || lpad(i::text, 7, '0') FROM generate_series(1, 3) AS i
         RETURNING id
       ), seller AS (
         INSERT INTO sellers (display_name) VALUES ('Иван Тестов') RETURNING id
       ), shop AS (
         INSERT INTO shops (seller_id, slug, name, status)
         SELECT id, 'reconcile-edge-shop', 'Тестовый магазин', 'published' FROM seller RETURNING id
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

  it("ignores a lower-rank status, an older event and a delivered delivery", async () => {
    const regress = await createDelivery("in_transit", "remote-regress");
    const older = await createDelivery("in_transit", "remote-older");
    const delivered = await createDelivery("delivered", "remote-done");
    const provider = stubProvider();
    provider.shipments.set(
      "remote-regress",
      shipment("CREATED", "Создан", new Date(NOW.getTime() - 60_000)),
    );
    provider.shipments.set(
      "remote-older",
      shipment("DELIVERED", "Вручён", new Date(NOW.getTime() - 10 * 60_000)),
    );
    provider.shipments.set("remote-done", shipment("DELIVERED", "Вручён", NOW));

    await reconcile.runDeliveryReconcile(provider, log, NOW);

    expect(provider.calls).toEqual(["remote-regress", "remote-older"]);
    expect((await stateOf(regress)).status).toBe("in_transit");
    expect((await stateOf(older)).status).toBe("in_transit");
    expect((await stateOf(delivered)).status).toBe("delivered");
    expect((await stateOf(regress)).events + (await stateOf(older)).events).toBe(0);
  });

  it("continues after a provider failure and a missing shipment without logging PII", async () => {
    const failing = await createDelivery("created", "remote-failing");
    const healthy = await createDelivery("created", "remote-healthy");
    const missing = await createDelivery("created", "remote-missing");
    const provider = stubProvider();
    provider.fail.add("remote-failing");
    provider.shipments.set(
      "remote-healthy",
      shipment("DELIVERED", "Вручён", new Date(NOW.getTime() - 60_000), "TRACK-OK"),
    );

    await reconcile.runDeliveryReconcile(provider, log, NOW);

    expect((await stateOf(failing)).status).toBe("created");
    expect((await stateOf(healthy)).status).toBe("delivered");
    expect((await stateOf(missing)).status).toBe("created");
    expect(provider.calls).toEqual(["remote-failing", "remote-healthy", "remote-missing"]);
    expect(log.warn).toHaveBeenCalled();
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls]);
    expect(logged).not.toContain("Иван Тестов");
    expect(logged).not.toContain("0000000000");
  });

  it("stops between rows when the signal is aborted", async () => {
    const first = await createDelivery("created", "remote-a");
    const second = await createDelivery("created", "remote-b");
    const provider = stubProvider();
    provider.shipments.set(
      "remote-a",
      shipment("DELIVERED", "Вручён", new Date(NOW.getTime() - 60_000)),
    );
    provider.shipments.set(
      "remote-b",
      shipment("DELIVERED", "Вручён", new Date(NOW.getTime() - 60_000)),
    );
    const controller = new AbortController();
    provider.onCall = () => controller.abort();

    await reconcile.runDeliveryReconcile(provider, log, NOW, controller.signal);

    expect(provider.calls).toHaveLength(1);
    expect((await stateOf(first)).status).toBe("delivered");
    expect((await stateOf(second)).status).toBe("created");
  });
});
