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
const orderIds: { a: number[]; b: number[] } = { a: [], b: [] };
let nextOrder = { a: 0, b: 0 };

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

async function createDelivery(
  shop: "a" | "b",
  status: string,
  providerOrderId: string,
  lastStatusAt = STALE,
) {
  const orderId = orderIds[shop][nextOrder[shop]];
  nextOrder[shop] += 1;
  if (!orderId) {
    throw new Error(`shop ${shop} fixture batch has no free order`);
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
  const result = await pool().query<{
    status: string;
    updated_at: Date;
    events: number;
  }>(
    `SELECT d.status, d.updated_at,
       (SELECT count(*)::int FROM delivery_events e WHERE e.delivery_id = d.id) AS events
     FROM order_deliveries d WHERE d.id = $1`,
    [deliveryId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("delivery row missing");
  }
  return row;
}

function loggedText(): string {
  const calls = [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls];
  return JSON.stringify(calls, (_key, value: unknown) => {
    if (value instanceof Error) {
      return `${value.name}:${value.message}`;
    }
    return value;
  });
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
    const fixtures = await pool().query<{ id: number; shop_id: number }>(
      `WITH seller_a AS (
         INSERT INTO sellers (display_name) VALUES ('Иван Тестов') RETURNING id
       ), seller_b AS (
         INSERT INTO sellers (display_name) VALUES ('Мария Тестова') RETURNING id
       ), shop_a AS (
         INSERT INTO shops (seller_id, slug, name, status)
         SELECT id, 'reconcile-edge-a', 'Магазин А', 'published' FROM seller_a RETURNING id
       ), shop_b AS (
         INSERT INTO shops (seller_id, slug, name, status)
         SELECT id, 'reconcile-edge-b', 'Магазин Б', 'published' FROM seller_b RETURNING id
       ), buyers AS (
         INSERT INTO users (phone)
         SELECT '+7999' || lpad(i::text, 7, '0') FROM generate_series(1, 6) AS i
         RETURNING id
       ), numbered AS (
         SELECT id, row_number() OVER (ORDER BY id) AS rn FROM buyers
       ), shop_ids AS (
         SELECT shop_a.id AS a, shop_b.id AS b FROM shop_a, shop_b
       )
       INSERT INTO orders (buyer_user_id, shop_id, status, total_kopecks, buyer_phone, client_checkout_id)
       SELECT n.id, CASE WHEN n.rn <= 3 THEN s.a ELSE s.b END, 'paid', 458000, '+7999', gen_random_uuid()
       FROM numbered n CROSS JOIN shop_ids s
       RETURNING id, shop_id`,
    );
    const shops = await pool().query<{ id: number; slug: string }>(
      "SELECT id, slug FROM shops WHERE slug IN ('reconcile-edge-a', 'reconcile-edge-b')",
    );
    const shopA = shops.rows.find((row) => row.slug === "reconcile-edge-a");
    const shopB = shops.rows.find((row) => row.slug === "reconcile-edge-b");
    if (!shopA || !shopB) {
      throw new Error("edge shops are missing");
    }
    orderIds.a = fixtures.rows.filter((row) => row.shop_id === shopA.id).map((row) => row.id);
    orderIds.b = fixtures.rows.filter((row) => row.shop_id === shopB.id).map((row) => row.id);
  });

  afterAll(async () => {
    await pool().end();
  });

  beforeEach(async () => {
    await pool().query("TRUNCATE TABLE delivery_events, order_deliveries CASCADE");
    nextOrder = { a: 0, b: 0 };
    vi.clearAllMocks();
  });

  it("ignores a lower-rank status, an older event and a delivered delivery", async () => {
    const regress = await createDelivery("a", "in_transit", "remote-regress");
    const older = await createDelivery("a", "in_transit", "remote-older");
    const delivered = await createDelivery("a", "delivered", "remote-done");
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

  it("delivers shop B while shop A fails, returns null and skips", async () => {
    const failing = await createDelivery("a", "created", "remote-failing");
    const missing = await createDelivery("a", "created", "remote-missing");
    const healthyA = await createDelivery("a", "created", "remote-healthy-a");
    const healthyB = await createDelivery("b", "created", "remote-healthy-b");
    const provider = stubProvider();
    provider.fail.add("remote-failing");
    provider.shipments.set(
      "remote-healthy-a",
      shipment("DELIVERED", "Вручён", new Date(NOW.getTime() - 60_000), "TRACK-A"),
    );
    provider.shipments.set(
      "remote-healthy-b",
      shipment("DELIVERED", "Вручён", new Date(NOW.getTime() - 60_000), "TRACK-B"),
    );

    await reconcile.runDeliveryReconcile(provider, log, NOW);

    expect((await stateOf(failing)).status).toBe("created");
    expect((await stateOf(missing)).status).toBe("created");
    expect((await stateOf(healthyA)).status).toBe("delivered");
    expect((await stateOf(healthyB)).status).toBe("delivered");
    expect((await stateOf(healthyB)).events).toBe(1);
    expect((await stateOf(failing)).updated_at.getTime()).toBe(NOW.getTime());
    expect((await stateOf(missing)).updated_at.getTime()).toBe(NOW.getTime());

    const logged = loggedText();
    expect(logged).not.toContain("Иван Тестов");
    expect(logged).not.toContain("Мария Тестова");
    expect(logged).not.toContain("0000000000");
    expect(logged).not.toContain("Невский 1");
    expect(log.warn).toHaveBeenCalled();
  });

  it("does not touch shop B when shop A aborts between rows, then delivers it", async () => {
    const first = await createDelivery("a", "created", "remote-a");
    const second = await createDelivery("b", "created", "remote-b");
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

    provider.onCall = null;
    await reconcile.runDeliveryReconcile(provider, log, NOW);
    expect((await stateOf(second)).status).toBe("delivered");
  });

  it("makes no provider call when the signal is already aborted", async () => {
    const shopA = await createDelivery("a", "created", "remote-a");
    const shopB = await createDelivery("b", "created", "remote-b");
    const provider = stubProvider();
    provider.shipments.set("remote-a", shipment("DELIVERED", "Вручён", NOW));
    provider.shipments.set("remote-b", shipment("DELIVERED", "Вручён", NOW));
    const controller = new AbortController();
    controller.abort();

    await reconcile.runDeliveryReconcile(provider, log, NOW, controller.signal);

    expect(provider.calls).toEqual([]);
    expect((await stateOf(shopA)).status).toBe("created");
    expect((await stateOf(shopB)).status).toBe("created");
  });
});
