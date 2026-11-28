import { createHash } from "node:crypto";
import type {
  DeliveryEvent,
  DeliveryManualTrack,
  DeliverySnapshot,
  DeliveryTariffListResponse,
  SellerDeliveryResponse,
} from "@localhand/shared";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import {
  deliveryEvents,
  orderDeliveries,
  orderItems,
  orders,
  products,
  sellers,
  shops,
} from "../db/schema.js";
import { deliverySettings } from "../env.js";
import { calculatePackaging } from "./packaging.js";
import { getDeliveryProvider } from "./provider-factory.js";
import { mapDeliveryStatus } from "./status.js";

export type ShipmentError =
  | "not_found"
  | "delivery_not_paid"
  | "delivery_unavailable"
  | "delivery_snapshot_missing"
  | "delivery_dimensions_missing"
  | "delivery_tariff_mismatch"
  | "delivery_already_created"
  | "delivery_already_exists"
  | "delivery_provider_error";

export type DeliveryActionResult =
  { ok: true; delivery: DeliverySnapshot } | { ok: false; error: ShipmentError };

type DeliveryContext = {
  orderId: number;
  shopId: number;
  orderStatus: "new" | "payment_pending" | "paid";
  buyerPhone: string;
  shopCityCode: number | null;
  shopCityName: string | null;
  shopShipmentPoint: string | null;
  delivery: {
    id: number;
    provider: string;
    status: DeliverySnapshot["status"];
    cityCode: number;
    cityName: string;
    pointCode: string;
    pointAddress: string;
    recipientName: string;
    recipientPhone: string;
    tariffCode: string | null;
    tariffName: string | null;
    priceKopecks: number;
    periodMin: number | null;
    periodMax: number | null;
    providerOrderId: string | null;
    providerNumber: string | null;
    carrier: string | null;
    trackNumber: string | null;
    lastStatusCode: string | null;
    lastStatusAt: Date | null;
  } | null;
};

const SELLER_DELIVERY_EVENTS_LIMIT = 50;

const deliverySelect = {
  id: orderDeliveries.id,
  provider: orderDeliveries.provider,
  status: orderDeliveries.status,
  cityCode: orderDeliveries.cityCode,
  cityName: orderDeliveries.cityName,
  pointCode: orderDeliveries.pointCode,
  pointAddress: orderDeliveries.pointAddress,
  recipientName: orderDeliveries.recipientName,
  recipientPhone: orderDeliveries.recipientPhone,
  tariffCode: orderDeliveries.providerTariffCode,
  tariffName: orderDeliveries.tariffName,
  priceKopecks: orderDeliveries.priceKopecks,
  periodMin: orderDeliveries.periodMin,
  periodMax: orderDeliveries.periodMax,
  providerOrderId: orderDeliveries.providerOrderId,
  providerNumber: orderDeliveries.providerNumber,
  carrier: orderDeliveries.carrier,
  trackNumber: orderDeliveries.trackNumber,
  lastStatusCode: orderDeliveries.lastStatusCode,
  lastStatusAt: orderDeliveries.lastStatusAt,
};

function toSnapshot(context: DeliveryContext): DeliverySnapshot | null {
  const delivery = context.delivery;
  if (!delivery) {
    return null;
  }
  return {
    provider: delivery.provider as DeliverySnapshot["provider"],
    status: delivery.status,
    cityCode: delivery.cityCode,
    cityName: delivery.cityName,
    pointCode: delivery.pointCode,
    pointAddress: delivery.pointAddress,
    recipientName: delivery.recipientName,
    tariffCode: delivery.tariffCode,
    tariffName: delivery.tariffName,
    priceKopecks: delivery.priceKopecks,
    periodMin: delivery.periodMin,
    periodMax: delivery.periodMax,
    providerOrderId: delivery.providerOrderId,
    providerNumber: delivery.providerNumber,
    carrier: delivery.carrier,
    trackNumber: delivery.trackNumber,
    lastStatusCode: delivery.lastStatusCode,
    lastStatusAt: delivery.lastStatusAt?.toISOString() ?? null,
  };
}

type QueryExecutor = Pick<ReturnType<typeof requireDb>, "select">;

async function loadContext(
  orderId: number,
  scope: { buyerUserId?: number; sellerUserId?: number },
  db: QueryExecutor = requireDb(),
  forUpdate = false,
): Promise<DeliveryContext | null> {
  const scopeCondition =
    scope.buyerUserId !== undefined
      ? eq(orders.buyerUserId, scope.buyerUserId)
      : eq(sellers.userId, scope.sellerUserId as number);

  const query = db
    .select({
      orderId: orders.id,
      shopId: orders.shopId,
      orderStatus: orders.status,
      buyerPhone: orders.buyerPhone,
      shopCityCode: shops.cdekCityCode,
      shopCityName: shops.cdekCityName,
      shopShipmentPoint: shops.cdekShipmentPoint,
      delivery: deliverySelect,
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .innerJoin(sellers, eq(shops.sellerId, sellers.id))
    .leftJoin(orderDeliveries, eq(orderDeliveries.orderId, orders.id))
    .where(and(eq(orders.id, orderId), scopeCondition))
    .limit(1);

  const rows = forUpdate ? await query.for("update", { of: orders }) : await query;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    orderId: row.orderId,
    shopId: row.shopId,
    orderStatus: row.orderStatus,
    buyerPhone: row.buyerPhone,
    shopCityCode: row.shopCityCode,
    shopCityName: row.shopCityName,
    shopShipmentPoint: row.shopShipmentPoint,
    delivery: row.delivery?.provider ? row.delivery : null,
  };
}

async function loadPackages(orderId: number, db: QueryExecutor = requireDb()) {
  const items = await db
    .select({ productId: orderItems.productId })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const productIds = items.map((item) => item.productId).filter((id): id is number => id !== null);
  if (productIds.length !== items.length || productIds.length === 0) {
    return null;
  }

  const rows = await db
    .select({
      id: products.id,
      weightG: products.weightG,
      lengthCm: products.lengthCm,
      widthCm: products.widthCm,
      heightCm: products.heightCm,
    })
    .from(products)
    .where(inArray(products.id, productIds));

  if (rows.length !== productIds.length) {
    return null;
  }
  if (
    !rows.every(
      (row) =>
        Number.isInteger(row.weightG) &&
        Number.isInteger(row.lengthCm) &&
        Number.isInteger(row.widthCm) &&
        Number.isInteger(row.heightCm) &&
        (row.weightG ?? 0) > 0 &&
        (row.lengthCm ?? 0) > 0 &&
        (row.widthCm ?? 0) > 0 &&
        (row.heightCm ?? 0) > 0,
    )
  ) {
    return null;
  }

  return calculatePackaging(
    rows.map((row) => ({
      weightG: row.weightG as number,
      lengthCm: row.lengthCm as number,
      widthCm: row.widthCm as number,
      heightCm: row.heightCm as number,
    })),
  );
}

function statusEventHash(statusCode: string, occurredAt: Date): string {
  return createHash("sha256").update(`${statusCode}:${occurredAt.toISOString()}`).digest("hex");
}

export async function getBuyerDelivery(
  userId: number,
  orderId: number,
): Promise<DeliverySnapshot | null> {
  const context = await loadContext(orderId, { buyerUserId: userId });

  return context ? toSnapshot(context) : null;
}

export async function getSellerDelivery(
  userId: number,
  orderId: number,
): Promise<SellerDeliveryResponse | null> {
  const context = await loadContext(orderId, { sellerUserId: userId });
  const deliveryRow = context?.delivery;
  const delivery = context ? toSnapshot(context) : null;
  if (!context || !deliveryRow || !delivery) {
    return null;
  }

  const rows = await requireDb()
    .select({
      statusCode: deliveryEvents.statusCode,
      statusName: deliveryEvents.statusName,
      occurredAt: deliveryEvents.occurredAt,
    })
    .from(deliveryEvents)
    .where(eq(deliveryEvents.deliveryId, deliveryRow.id))
    .orderBy(desc(deliveryEvents.occurredAt), desc(deliveryEvents.id))
    .limit(SELLER_DELIVERY_EVENTS_LIMIT);

  const events: DeliveryEvent[] = rows.map((row) => ({
    statusCode: row.statusCode,
    statusName: row.statusName,
    occurredAt: row.occurredAt.toISOString(),
  }));

  return { delivery, events };
}

export type TariffResult =
  { ok: true; tariffs: DeliveryTariffListResponse } | { ok: false; error: ShipmentError };

export async function listSellerTariffs(userId: number, orderId: number): Promise<TariffResult> {
  const provider = getDeliveryProvider();
  if (!provider) {
    return { ok: false, error: "delivery_unavailable" };
  }

  const context = await loadContext(orderId, { sellerUserId: userId });
  if (!context) {
    return { ok: false, error: "not_found" };
  }
  if (context.orderStatus !== "paid") {
    return { ok: false, error: "delivery_not_paid" };
  }
  if (!context.delivery) {
    return { ok: false, error: "delivery_snapshot_missing" };
  }
  if (!context.shopCityCode || !context.shopShipmentPoint) {
    return { ok: false, error: "delivery_unavailable" };
  }

  const packages = await loadPackages(orderId);
  if (!packages) {
    return { ok: false, error: "delivery_dimensions_missing" };
  }

  try {
    const values = await provider.listTariffs({
      fromCityCode: context.shopCityCode,
      fromPointCode: context.shopShipmentPoint,
      toCityCode: context.delivery.cityCode,
      toPointCode: context.delivery.pointCode,
      packages,
    });
    const paidTariffCode = context.delivery.tariffCode;
    const paid = values.find((tariff) => tariff.tariffCode === paidTariffCode);
    if (!paid) {
      return { ok: false, error: "delivery_tariff_mismatch" };
    }
    return {
      ok: true,
      tariffs: {
        paid: { tariffCode: paid.tariffCode, priceKopecks: paid.priceKopecks },
        tariffs: values.map((tariff) => ({ shopId: context.shopId, ...tariff })),
      },
    };
  } catch {
    return { ok: false, error: "delivery_provider_error" };
  }
}

export async function createSellerShipment(
  userId: number,
  orderId: number,
  tariffCode: string,
): Promise<DeliveryActionResult> {
  const provider = getDeliveryProvider();
  if (!provider || !deliverySettings) {
    return { ok: false, error: "delivery_unavailable" };
  }

  return requireDb().transaction(async (tx) => {
    const context = await loadContext(orderId, { sellerUserId: userId }, tx, true);
    if (!context) {
      return { ok: false, error: "not_found" };
    }
    if (context.orderStatus !== "paid") {
      return { ok: false, error: "delivery_not_paid" };
    }
    if (!context.delivery) {
      return { ok: false, error: "delivery_snapshot_missing" };
    }
    if (context.delivery.providerOrderId) {
      return { ok: true, delivery: toSnapshot(context) as DeliverySnapshot };
    }
    if (context.delivery.status === "manual" || context.delivery.trackNumber !== null) {
      return { ok: false, error: "delivery_already_exists" };
    }

    let remote = null;
    try {
      remote = await provider.findShipmentByNumber(`order-${orderId}`);
    } catch {
      return { ok: false, error: "delivery_provider_error" };
    }
    if (remote?.providerOrderId) {
      const occurredAt = remote.statusDateTime ? new Date(remote.statusDateTime) : new Date();
      const [adopted] = await tx
        .update(orderDeliveries)
        .set({
          status: mapDeliveryStatus(remote.statusCode),
          providerOrderId: remote.providerOrderId,
          providerNumber: remote.trackNumber,
          lastStatusCode: remote.statusCode,
          lastStatusAt: occurredAt,
          updatedAt: new Date(),
        })
        .where(eq(orderDeliveries.orderId, orderId))
        .returning();
      if (!adopted) {
        return { ok: false, error: "delivery_provider_error" };
      }
      await tx
        .insert(deliveryEvents)
        .values({
          deliveryId: context.delivery.id,
          statusCode: remote.statusCode,
          statusName: remote.statusName,
          occurredAt,
          payloadHash: statusEventHash(remote.statusCode, occurredAt),
        })
        .onConflictDoNothing();
      return {
        ok: true,
        delivery: toSnapshot({
          ...context,
          delivery: { ...context.delivery, ...adopted, tariffCode: adopted.providerTariffCode },
        }) as DeliverySnapshot,
      };
    }

    if (!context.shopCityCode || !context.shopShipmentPoint) {
      return { ok: false, error: "delivery_unavailable" };
    }

    const packages = await loadPackages(orderId, tx);
    if (!packages) {
      return { ok: false, error: "delivery_dimensions_missing" };
    }

    let tariff;
    try {
      const values = await provider.listTariffs({
        fromCityCode: context.shopCityCode,
        fromPointCode: context.shopShipmentPoint,
        toCityCode: context.delivery.cityCode,
        toPointCode: context.delivery.pointCode,
        packages,
      });
      tariff = values.find((candidate) => candidate.tariffCode === tariffCode);
    } catch {
      return { ok: false, error: "delivery_provider_error" };
    }
    if (
      !tariff ||
      tariff.tariffCode !== context.delivery.tariffCode ||
      tariff.priceKopecks !== context.delivery.priceKopecks
    ) {
      return { ok: false, error: "delivery_tariff_mismatch" };
    }

    let created;
    try {
      created = await provider.createShipment({
        orderId,
        tariffCode,
        fromCityCode: context.shopCityCode,
        fromPointCode: context.shopShipmentPoint,
        toCityCode: context.delivery.cityCode,
        toPointCode: context.delivery.pointCode,
        recipientName: context.delivery.recipientName,
        recipientPhone: context.buyerPhone,
        packages,
      });
    } catch {
      return { ok: false, error: "delivery_provider_error" };
    }

    const occurredAt = created.statusDateTime ? new Date(created.statusDateTime) : new Date();
    const [updated] = await tx
      .update(orderDeliveries)
      .set({
        status: "created",
        providerOrderId: created.providerOrderId,
        providerNumber: created.providerNumber,
        lastStatusCode: created.statusCode,
        lastStatusAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(and(eq(orderDeliveries.orderId, orderId), isNull(orderDeliveries.providerOrderId)))
      .returning();
    if (!updated) {
      const current = await loadContext(orderId, { sellerUserId: userId }, tx);
      if (current?.delivery?.providerOrderId) {
        return { ok: true, delivery: toSnapshot(current) as DeliverySnapshot };
      }
      return { ok: false, error: "delivery_provider_error" };
    }

    await tx
      .insert(deliveryEvents)
      .values({
        deliveryId: context.delivery.id,
        statusCode: created.statusCode,
        statusName: created.statusName,
        occurredAt,
        payloadHash: statusEventHash(created.statusCode, occurredAt),
      })
      .onConflictDoNothing();

    return {
      ok: true,
      delivery: toSnapshot({
        ...context,
        delivery: { ...context.delivery, ...updated, tariffCode: updated.providerTariffCode },
      }) as DeliverySnapshot,
    };
  });
}

export async function saveManualTrack(
  userId: number,
  orderId: number,
  input: DeliveryManualTrack,
): Promise<DeliveryActionResult> {
  return requireDb().transaction(async (tx) => {
    const context = await loadContext(orderId, { sellerUserId: userId }, tx, true);
    if (!context) {
      return { ok: false, error: "not_found" };
    }
    if (context.orderStatus !== "paid") {
      return { ok: false, error: "delivery_not_paid" };
    }
    if (context.delivery) {
      if (
        context.delivery.providerOrderId ||
        context.delivery.status === "manual" ||
        context.delivery.trackNumber !== null
      ) {
        return { ok: false, error: "delivery_already_exists" };
      }

      const provider = getDeliveryProvider();
      // In manual mode there is no API to ask: the seller explicitly takes
      // responsibility for the carrier/track. Only a configured provider is
      // consulted to avoid creating a manual duplicate of a CDEK order.
      if (provider) {
        try {
          const remote = await provider.findShipmentByNumber(`order-${orderId}`);
          if (remote) {
            return { ok: false, error: "delivery_already_exists" };
          }
        } catch {
          return { ok: false, error: "delivery_provider_error" };
        }
      }
    }

    const occurredAt = new Date();
    if (!context.delivery) {
      const [inserted] = await tx
        .insert(orderDeliveries)
        .values({
          orderId,
          provider: "manual",
          status: "manual",
          cityCode: 0,
          cityName: "Не указан",
          pointCode: "manual",
          pointAddress: "Не указан",
          recipientName: "Не указан",
          recipientPhone: context.buyerPhone,
          priceKopecks: 0,
          carrier: input.carrier,
          trackNumber: input.trackNumber,
          lastStatusCode: "MANUAL",
          lastStatusAt: occurredAt,
        })
        .returning();
      if (!inserted) {
        return { ok: false, error: "delivery_provider_error" };
      }
      await tx
        .insert(deliveryEvents)
        .values({
          deliveryId: inserted.id,
          statusCode: "MANUAL",
          statusName: input.carrier,
          occurredAt,
          payloadHash: statusEventHash("MANUAL", occurredAt),
        })
        .onConflictDoNothing();
      return {
        ok: true,
        delivery: toSnapshot({
          ...context,
          delivery: { ...inserted, tariffCode: inserted.providerTariffCode },
        }) as DeliverySnapshot,
      };
    }

    const [updated] = await tx
      .update(orderDeliveries)
      .set({
        status: "manual",
        carrier: input.carrier,
        trackNumber: input.trackNumber,
        lastStatusCode: "MANUAL",
        lastStatusAt: occurredAt,
        updatedAt: occurredAt,
      })
      .where(
        and(
          eq(orderDeliveries.orderId, orderId),
          isNull(orderDeliveries.providerOrderId),
          isNull(orderDeliveries.trackNumber),
        ),
      )
      .returning();
    if (!updated) {
      return { ok: false, error: "delivery_already_exists" };
    }

    await tx
      .insert(deliveryEvents)
      .values({
        deliveryId: context.delivery.id,
        statusCode: "MANUAL",
        statusName: input.carrier,
        occurredAt,
        payloadHash: statusEventHash("MANUAL", occurredAt),
      })
      .onConflictDoNothing();

    return {
      ok: true,
      delivery: toSnapshot({
        ...context,
        delivery: { ...context.delivery, ...updated, tariffCode: updated.providerTariffCode },
      }) as DeliverySnapshot,
    };
  });
}

export type WebhookResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "delivery_unavailable" | "delivery_provider_error" };

export async function handleCdekWebhook(payload: {
  uuid?: string;
  attributes?: { number?: string; cdek_number?: string };
}): Promise<WebhookResult> {
  const provider = getDeliveryProvider();
  if (!provider) {
    return { ok: false, error: "delivery_unavailable" };
  }

  const providerOrderId = payload.uuid;
  if (!providerOrderId) {
    return { ok: false, error: "not_found" };
  }

  const [row] = await requireDb()
    .select({
      id: orderDeliveries.id,
      orderId: orderDeliveries.orderId,
      status: orderDeliveries.status,
      providerNumber: orderDeliveries.providerNumber,
      trackNumber: orderDeliveries.trackNumber,
    })
    .from(orderDeliveries)
    .where(eq(orderDeliveries.providerOrderId, providerOrderId))
    .limit(1);
  if (!row) {
    return { ok: false, error: "not_found" };
  }

  const number = payload.attributes?.number;
  const cdekNumber = payload.attributes?.cdek_number;
  if (
    (number && number !== row.providerNumber && number !== `order-${row.orderId}`) ||
    (cdekNumber && cdekNumber !== row.providerNumber && cdekNumber !== row.trackNumber)
  ) {
    return { ok: false, error: "not_found" };
  }

  let state;
  try {
    state = await provider.getShipment(providerOrderId);
  } catch {
    return { ok: false, error: "delivery_provider_error" };
  }
  if (!state) {
    return { ok: false, error: "not_found" };
  }

  const status = mapDeliveryStatus(state.statusCode);
  const occurredAt = state.statusDateTime ? new Date(state.statusDateTime) : new Date();
  const statusRank: Record<string, number> = {
    quoted: 0,
    created: 1,
    in_transit: 2,
    manual: 3,
    delivered: 3,
    canceled: 3,
    failed: 3,
  };
  if ((statusRank[status] ?? 0) < (statusRank[row.status] ?? 0)) {
    return { ok: true };
  }
  await requireDb().transaction(async (tx) => {
    const [applied] = await tx
      .update(orderDeliveries)
      .set({
        status,
        trackNumber: state.trackNumber ?? undefined,
        lastStatusCode: state.statusCode,
        lastStatusAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orderDeliveries.id, row.id),
          or(isNull(orderDeliveries.lastStatusAt), lte(orderDeliveries.lastStatusAt, occurredAt)),
        ),
      )
      .returning({ id: orderDeliveries.id });
    if (!applied) {
      return;
    }
    await tx
      .insert(deliveryEvents)
      .values({
        deliveryId: row.id,
        statusCode: state.statusCode,
        statusName: state.statusName,
        occurredAt,
        payloadHash: statusEventHash(state.statusCode, occurredAt),
      })
      .onConflictDoNothing();
  });

  return { ok: true };
}
