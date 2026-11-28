import { fileURLToPath } from "node:url";
import type { DeliveryStatus } from "@localhand/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryProvider, ShipmentState } from "./provider.js";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type DbClientModule = typeof import("../db/client.js");
type ReconcileModule = typeof import("./delivery.reconcile.js");
let dbClient!: DbClientModule;
let reconcileModule!: ReconcileModule;

class StubProvider implements DeliveryProvider {
  readonly name = "fake" as const;
  readonly shipments = new Map<string, ShipmentState>();
  readonly failing = new Set<string>();
  readonly calls: string[] = [];
  onCall: (() => void) | null = null;

  async getShipment(providerOrderId: string): Promise<ShipmentState | null> {
    this.calls.push(providerOrderId);
    this.onCall?.();
    if (this.failing.has(providerOrderId)) {
      throw new Error("provider unavailable");
    }
    return this.shipments.get(providerOrderId) ?? null;
  }

  listCities = async (_query: string) => this.unused();
  listPoints = async (_cityCode: number) => this.unused();
  quote = async () => this.unused();
  listTariffs = async () => this.unused();
  createShipment = async () => this.unused();
  findShipmentByNumber = async (_number: string) => this.unused();
  ensureOrderStatusWebhook = async () => this.unused();

  private unused(): never {
    throw new Error("stub provider method is not used by reconcile");
  }
}

function testLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function firstId(result: { rows: Array<{ id: number }> }): number {
  const id = result.rows[0]?.id;
  if (id === undefined) {
    throw new Error("insert returned no id");
  }
  return id;
}

let fixtureSeq = 0;

async function createDelivery(input: {
  status: DeliveryStatus;
  providerOrderId?: string | null;
  lastStatusAt?: Date | null;
  updatedAt?: Date;
}): Promise<{ orderId: number; deliveryId: number }> {
  const pool = dbClient.requirePool();
  fixtureSeq += 1;
  const buyerPhone = `+7999${String(fixtureSeq).padStart(7, "0")}`;
  const buyer = await pool.query<{ id: number }>(
    "INSERT INTO users (phone) VALUES ($1) RETURNING id",
    [buyerPhone],
  );
  const seller = await pool.query<{ id: number }>(
    "INSERT INTO sellers (display_name) VALUES ('Иван Тестов') RETURNING id",
  );
  const shop = await pool.query<{ id: number }>(
    `INSERT INTO shops (seller_id, slug, name, status)
     VALUES ($1, $2, 'Тестовый магазин', 'published') RETURNING id`,
    [firstId(seller), `reconcile-shop-${fixtureSeq}`],
  );
  const order = await pool.query<{ id: number }>(
    `INSERT INTO orders (buyer_user_id, shop_id, status, total_kopecks, buyer_phone, client_checkout_id)
     VALUES ($1, $2, 'paid', 458000, $3, gen_random_uuid()) RETURNING id`,
    [firstId(buyer), firstId(shop), buyerPhone],
  );
  const delivery = await pool.query<{ id: number }>(
    `INSERT INTO order_deliveries
       (order_id, provider, status, city_code, city_name, point_code, point_address,
        recipient_name, recipient_phone, price_kopecks, provider_order_id,
        last_status_at, updated_at)
     VALUES ($1, 'fake', $2, 137, 'Санкт-Петербург', 'SPB001', 'Санкт-Петербург, Невский 1',
        'Иван Тестов', '0000000000', 38000, $3, $4, $5)
     RETURNING id`,
    [
      firstId(order),
      input.status,
      input.providerOrderId ?? null,
      input.lastStatusAt ?? null,
      input.updatedAt ?? new Date(),
    ],
  );
  return { orderId: firstId(order), deliveryId: firstId(delivery) };
}

async function deliveryRow(deliveryId: number) {
  const result = await dbClient.requirePool().query<{
    status: DeliveryStatus;
    track_number: string | null;
    last_status_code: string | null;
    last_status_at: Date | null;
  }>(
    `SELECT status, track_number, last_status_code, last_status_at
     FROM order_deliveries WHERE id = $1`,
    [deliveryId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("delivery row missing");
  }
  return row;
}

async function eventCodes(deliveryId: number): Promise<string[]> {
  const result = await dbClient
    .requirePool()
    .query<{ status_code: string }>(
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

describeWithDb("delivery reconcile", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    reconcileModule = await import("./delivery.reconcile.js");
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

  beforeEach(async () => {
    await dbClient
      .requirePool()
      .query(
        "TRUNCATE TABLE delivery_events, order_deliveries, order_items, orders, products, shops, sellers, users, otp_codes CASCADE",
      );
  });

  it("applies a delivered status and track for stale deliveries of different shops once", async () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    const stale = new Date(now.getTime() - 5 * 60_000);
    const created = await createDelivery({
      status: "created",
      providerOrderId: "remote-1",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const inTransit = await createDelivery({
      status: "in_transit",
      providerOrderId: "remote-2",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const noLastStatus = await createDelivery({
      status: "created",
      providerOrderId: "remote-3",
      lastStatusAt: null,
      updatedAt: stale,
    });
    const provider = new StubProvider();
    const occurredAt = new Date(now.getTime() - 60_000);
    provider.shipments.set("remote-1", shipment("DELIVERED", "Вручён", occurredAt, "TRACK-1"));
    provider.shipments.set("remote-2", shipment("DELIVERED", "Вручён", occurredAt, "TRACK-2"));
    provider.shipments.set("remote-3", shipment("DELIVERED", "Вручён", occurredAt, "TRACK-3"));

    await reconcileModule.runDeliveryReconcile(provider, testLogger(), now);

    for (const [id, track] of [
      [created.deliveryId, "TRACK-1"],
      [inTransit.deliveryId, "TRACK-2"],
      [noLastStatus.deliveryId, "TRACK-3"],
    ] as const) {
      expect(await deliveryRow(id)).toMatchObject({
        status: "delivered",
        track_number: track,
        last_status_code: "DELIVERED",
      });
      expect(await eventCodes(id)).toEqual(["DELIVERED"]);
    }

    await reconcileModule.runDeliveryReconcile(
      provider,
      testLogger(),
      new Date(now.getTime() + 5 * 60_000),
    );

    expect(await eventCodes(created.deliveryId)).toEqual(["DELIVERED"]);
    expect(await eventCodes(inTransit.deliveryId)).toEqual(["DELIVERED"]);
  });

  it("does not poll fresh deliveries or quoted, manual and delivered statuses", async () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    const stale = new Date(now.getTime() - 5 * 60_000);
    const fresh = await createDelivery({
      status: "in_transit",
      providerOrderId: "fresh-1",
      lastStatusAt: new Date(now.getTime() - 30_000),
      updatedAt: new Date(now.getTime() - 30_000),
    });
    const quoted = await createDelivery({
      status: "quoted",
      providerOrderId: "quoted-1",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const manual = await createDelivery({
      status: "manual",
      providerOrderId: "manual-1",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const delivered = await createDelivery({
      status: "delivered",
      providerOrderId: "delivered-1",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const provider = new StubProvider();
    for (const id of ["fresh-1", "quoted-1", "manual-1", "delivered-1"]) {
      provider.shipments.set(id, shipment("DELIVERED", "Вручён", now));
    }

    await reconcileModule.runDeliveryReconcile(provider, testLogger(), now);

    expect(provider.calls).toEqual([]);
    expect((await deliveryRow(fresh.deliveryId)).status).toBe("in_transit");
    expect((await deliveryRow(quoted.deliveryId)).status).toBe("quoted");
    expect((await deliveryRow(manual.deliveryId)).status).toBe("manual");
    expect((await deliveryRow(delivered.deliveryId)).status).toBe("delivered");
  });

  it("stores an unknown provider code as in_transit and keeps the raw code", async () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    const stale = new Date(now.getTime() - 5 * 60_000);
    const delivery = await createDelivery({
      status: "created",
      providerOrderId: "remote-unknown",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const provider = new StubProvider();
    provider.shipments.set(
      "remote-unknown",
      shipment("SOMETHING_NEW", "Новый скан", new Date(now.getTime() - 60_000)),
    );

    await reconcileModule.runDeliveryReconcile(provider, testLogger(), now);

    expect(await deliveryRow(delivery.deliveryId)).toMatchObject({
      status: "in_transit",
      last_status_code: "SOMETHING_NEW",
    });
    expect(await eventCodes(delivery.deliveryId)).toEqual(["SOMETHING_NEW"]);
  });

  it("ignores a lower-rank status and an older event without writing an event", async () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    const stale = new Date(now.getTime() - 5 * 60_000);
    const delivered = await createDelivery({
      status: "delivered",
      providerOrderId: "remote-regress",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const inTransit = await createDelivery({
      status: "in_transit",
      providerOrderId: "remote-older",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const provider = new StubProvider();
    provider.shipments.set(
      "remote-regress",
      shipment("CREATED", "Создан", new Date(now.getTime() - 60_000)),
    );
    provider.shipments.set(
      "remote-older",
      shipment("DELIVERED", "Вручён", new Date(now.getTime() - 10 * 60_000)),
    );

    await reconcileModule.runDeliveryReconcile(provider, testLogger(), now);

    expect((await deliveryRow(delivered.deliveryId)).status).toBe("delivered");
    expect((await deliveryRow(inTransit.deliveryId)).status).toBe("in_transit");
    expect(await eventCodes(delivered.deliveryId)).toEqual([]);
    expect(await eventCodes(inTransit.deliveryId)).toEqual([]);
  });

  it("continues after a provider failure, skips a missing shipment and logs no PII", async () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    const stale = new Date(now.getTime() - 5 * 60_000);
    const failing = await createDelivery({
      status: "created",
      providerOrderId: "remote-failing",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const healthy = await createDelivery({
      status: "created",
      providerOrderId: "remote-healthy",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const missing = await createDelivery({
      status: "created",
      providerOrderId: "remote-missing",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const provider = new StubProvider();
    provider.failing.add("remote-failing");
    provider.shipments.set(
      "remote-healthy",
      shipment("DELIVERED", "Вручён", new Date(now.getTime() - 60_000), "TRACK-OK"),
    );
    const log = testLogger();

    await reconcileModule.runDeliveryReconcile(provider, log, now);

    expect((await deliveryRow(failing.deliveryId)).status).toBe("created");
    expect(await eventCodes(failing.deliveryId)).toEqual([]);
    expect((await deliveryRow(healthy.deliveryId)).status).toBe("delivered");
    expect(await eventCodes(healthy.deliveryId)).toEqual(["DELIVERED"]);
    expect((await deliveryRow(missing.deliveryId)).status).toBe("created");
    expect(provider.calls).toEqual(["remote-failing", "remote-healthy", "remote-missing"]);

    expect(log.warn).toHaveBeenCalled();
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls]);
    expect(logged).not.toContain("Иван Тестов");
    expect(logged).not.toContain("0000000000");
  });

  it("stops between rows when the signal is aborted", async () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    const stale = new Date(now.getTime() - 5 * 60_000);
    const first = await createDelivery({
      status: "created",
      providerOrderId: "remote-a",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const second = await createDelivery({
      status: "created",
      providerOrderId: "remote-b",
      lastStatusAt: stale,
      updatedAt: stale,
    });
    const provider = new StubProvider();
    provider.shipments.set(
      "remote-a",
      shipment("DELIVERED", "Вручён", new Date(now.getTime() - 60_000)),
    );
    provider.shipments.set(
      "remote-b",
      shipment("DELIVERED", "Вручён", new Date(now.getTime() - 60_000)),
    );
    const controller = new AbortController();
    provider.onCall = () => controller.abort();

    await reconcileModule.runDeliveryReconcile(provider, testLogger(), now, controller.signal);

    expect(provider.calls).toHaveLength(1);
    expect((await deliveryRow(first.deliveryId)).status).toBe("delivered");
    expect((await deliveryRow(second.deliveryId)).status).toBe("created");
  });
});
