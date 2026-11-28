import { createHash } from "node:crypto";
import type { DeliveryStatus } from "@localhand/shared";
import { and, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { requireDb } from "../db/client.js";
import { deliveryEvents, orderDeliveries } from "../db/schema.js";
import type { DeliveryProvider, ShipmentState } from "./provider.js";
import { mapDeliveryStatus } from "./status.js";

export const DELIVERY_RECONCILE_INTERVAL_MS = 60_000;
/** A webhook is considered lost once a pollable delivery is this old. */
export const DELIVERY_RECONCILE_AGE_MS = 2 * 60_000;
const RECONCILE_BATCH_SIZE = 50;

export type DeliveryReconcileLogger = Pick<FastifyBaseLogger, "info" | "warn" | "error">;

const STATUS_RANK: Record<DeliveryStatus, number> = {
  quoted: 0,
  created: 1,
  in_transit: 2,
  manual: 3,
  delivered: 3,
  canceled: 3,
  failed: 3,
};

function statusEventHash(statusCode: string, occurredAt: Date): string {
  return createHash("sha256").update(`${statusCode}:${occurredAt.toISOString()}`).digest("hex");
}

/**
 * One reconcile pass for deliveries whose `ORDER_STATUS` webhook was lost.
 * The provider call happens before the short transaction: a slow CDEK must
 * not hold a row lock, and one failed shipment never blocks the rest.
 */
export async function runDeliveryReconcile(
  provider: DeliveryProvider,
  log: DeliveryReconcileLogger,
  now = new Date(),
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return;
  }

  const cutoff = new Date(now.getTime() - DELIVERY_RECONCILE_AGE_MS);
  const candidates = await requireDb()
    .select({
      id: orderDeliveries.id,
      orderId: orderDeliveries.orderId,
      providerOrderId: orderDeliveries.providerOrderId,
    })
    .from(orderDeliveries)
    .where(
      and(
        inArray(orderDeliveries.status, ["created", "in_transit"]),
        isNotNull(orderDeliveries.providerOrderId),
        or(
          lt(orderDeliveries.lastStatusAt, cutoff),
          and(isNull(orderDeliveries.lastStatusAt), lt(orderDeliveries.updatedAt, cutoff)),
        ),
      ),
    )
    .limit(RECONCILE_BATCH_SIZE);

  for (const candidate of candidates) {
    if (signal?.aborted) {
      return;
    }
    if (!candidate.providerOrderId) {
      continue;
    }
    try {
      await reconcileOne(provider, candidate, log, now);
    } catch {
      log.warn(
        {
          code: "delivery_reconcile_failed",
          delivery_id: candidate.id,
          order_id: candidate.orderId,
          provider: provider.name,
        },
        "delivery reconcile row failed",
      );
    }
  }
}

async function reconcileOne(
  provider: DeliveryProvider,
  candidate: { id: number; orderId: number; providerOrderId: string | null },
  log: DeliveryReconcileLogger,
  now: Date,
): Promise<void> {
  if (!candidate.providerOrderId) {
    return;
  }
  const providerOrderId = candidate.providerOrderId;

  let remote: ShipmentState | null;
  try {
    remote = await provider.getShipment(providerOrderId);
  } catch {
    log.warn(
      {
        code: "delivery_reconcile_provider_error",
        delivery_id: candidate.id,
        order_id: candidate.orderId,
        provider: provider.name,
      },
      "delivery reconcile status lookup failed",
    );
    return;
  }
  if (!remote) {
    return;
  }

  const status = mapDeliveryStatus(remote.statusCode);
  const parsed = remote.statusDateTime ? new Date(remote.statusDateTime) : null;
  const occurredAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;

  await requireDb().transaction(async (tx) => {
    const [current] = await tx
      .select({
        status: orderDeliveries.status,
        lastStatusAt: orderDeliveries.lastStatusAt,
        providerOrderId: orderDeliveries.providerOrderId,
      })
      .from(orderDeliveries)
      .where(eq(orderDeliveries.id, candidate.id))
      .for("update");
    if (!current || current.providerOrderId !== providerOrderId) {
      return;
    }
    if (STATUS_RANK[status] < STATUS_RANK[current.status]) {
      return;
    }
    if (current.lastStatusAt && current.lastStatusAt.getTime() > occurredAt.getTime()) {
      return;
    }

    const [applied] = await tx
      .update(orderDeliveries)
      .set({
        status,
        ...(remote.trackNumber === null ? {} : { trackNumber: remote.trackNumber }),
        lastStatusCode: remote.statusCode,
        lastStatusAt: occurredAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(orderDeliveries.id, candidate.id),
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
        deliveryId: candidate.id,
        statusCode: remote.statusCode,
        statusName: remote.statusName,
        occurredAt,
        payloadHash: statusEventHash(remote.statusCode, occurredAt),
      })
      .onConflictDoNothing();

    log.info(
      {
        code: "delivery_reconcile_applied",
        delivery_id: candidate.id,
        order_id: candidate.orderId,
        provider: provider.name,
        status: remote.statusCode,
      },
      "delivery reconcile applied the provider status",
    );
  });
}
