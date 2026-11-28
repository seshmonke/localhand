import { createHash } from "node:crypto";
import type { DeliveryStatus } from "@localhand/shared";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
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

type Database = ReturnType<typeof requireDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type TouchExecutor = Pick<Database, "update"> | Transaction;

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
    .orderBy(asc(orderDeliveries.updatedAt), asc(orderDeliveries.id))
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
    } catch (error) {
      log.warn(
        {
          code: "delivery_reconcile_failed",
          delivery_id: candidate.id,
          order_id: candidate.orderId,
          provider: provider.name,
          err: error,
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
  } catch (error) {
    log.warn(
      {
        code: "delivery_reconcile_provider_error",
        delivery_id: candidate.id,
        order_id: candidate.orderId,
        provider: provider.name,
        err: error,
      },
      "delivery reconcile status lookup failed",
    );
    await touchAttempt(candidate.id, providerOrderId, now);
    return;
  }
  if (!remote) {
    await touchAttempt(candidate.id, providerOrderId, now);
    return;
  }

  const status = mapDeliveryStatus(remote.statusCode);
  const parsed = remote.statusDateTime ? new Date(remote.statusDateTime) : null;
  const occurredAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;

  let appliedStatus: string | null = null;
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
    if (
      STATUS_RANK[status] < STATUS_RANK[current.status] ||
      (current.lastStatusAt && current.lastStatusAt.getTime() > occurredAt.getTime())
    ) {
      await touchAttempt(candidate.id, providerOrderId, now, tx);
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
      await touchAttempt(candidate.id, providerOrderId, now, tx);
      return;
    }

    const [event] = await tx
      .insert(deliveryEvents)
      .values({
        deliveryId: candidate.id,
        statusCode: remote.statusCode,
        statusName: remote.statusName,
        occurredAt,
        payloadHash: statusEventHash(remote.statusCode, occurredAt),
      })
      .onConflictDoNothing()
      .returning({ id: deliveryEvents.id });
    if (event) {
      appliedStatus = remote.statusCode;
    }
  });

  if (appliedStatus !== null) {
    log.info(
      {
        code: "delivery_reconcile_applied",
        delivery_id: candidate.id,
        order_id: candidate.orderId,
        provider: provider.name,
        status: appliedStatus,
      },
      "delivery reconcile applied the provider status",
    );
  }
}

async function touchAttempt(
  deliveryId: number,
  providerOrderId: string,
  now: Date,
  executor: TouchExecutor = requireDb(),
): Promise<void> {
  await executor
    .update(orderDeliveries)
    .set({ updatedAt: now })
    .where(
      and(eq(orderDeliveries.id, deliveryId), eq(orderDeliveries.providerOrderId, providerOrderId)),
    );
}
