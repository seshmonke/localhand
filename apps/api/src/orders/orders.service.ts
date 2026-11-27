import {
  orderTotalKopecks,
  type AuthUser,
  type Checkout,
  type DeliveryQuoteShop,
  type DeliverySnapshot,
  type OrderItem,
  type OrderStatus,
  type OrderSummary,
} from "@localhand/shared";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { orderDeliveries, orderItems, orders, products, sellers, shops } from "../db/schema.js";
import { deliverySettings } from "../env.js";
import { hashProductIds, verifyQuoteToken } from "../delivery/quote-token.js";

function matchAll(...conditions: SQL[]): SQL {
  const where = and(...conditions);
  if (!where) {
    throw new Error("at least one condition is required");
  }
  return where;
}

const orderColumns = {
  id: orders.id,
  status: orders.status,
  totalKopecks: orders.totalKopecks,
  buyerPhone: orders.buyerPhone,
  comment: orders.comment,
  createdAt: orders.createdAt,
  shopSlug: shops.slug,
  shopName: shops.name,
};

type OrderRow = {
  id: number;
  status: OrderStatus;
  totalKopecks: number;
  buyerPhone: string;
  comment: string | null;
  createdAt: Date;
  shopSlug: string;
  shopName: string;
};

type OrderItemRow = {
  orderId: number;
  productId: number | null;
  name: string;
  priceKopecks: number;
};

async function loadItemsByOrder(orderIds: number[]): Promise<Map<number, OrderItem[]>> {
  const itemsByOrder = new Map<number, OrderItem[]>();
  if (orderIds.length === 0) {
    return itemsByOrder;
  }

  const itemRows: OrderItemRow[] = await requireDb()
    .select({
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      name: orderItems.name,
      priceKopecks: orderItems.priceKopecks,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(orderItems.id);

  for (const row of itemRows) {
    const items = itemsByOrder.get(row.orderId) ?? [];
    items.push({
      productId: row.productId,
      name: row.name,
      priceKopecks: row.priceKopecks,
      quantity: 1,
    });
    itemsByOrder.set(row.orderId, items);
  }

  return itemsByOrder;
}

type DeliveryRow = {
  orderId: number;
  provider: string;
  status: DeliverySnapshot["status"];
  cityCode: number;
  cityName: string;
  pointCode: string;
  pointAddress: string;
  recipientName: string;
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
};

function toDeliverySnapshot(row: DeliveryRow): DeliverySnapshot {
  return {
    provider: row.provider as DeliverySnapshot["provider"],
    status: row.status,
    cityCode: row.cityCode,
    cityName: row.cityName,
    pointCode: row.pointCode,
    pointAddress: row.pointAddress,
    recipientName: row.recipientName,
    tariffCode: row.tariffCode,
    tariffName: row.tariffName,
    priceKopecks: row.priceKopecks,
    periodMin: row.periodMin,
    periodMax: row.periodMax,
    providerOrderId: row.providerOrderId,
    providerNumber: row.providerNumber,
    carrier: row.carrier,
    trackNumber: row.trackNumber,
    lastStatusCode: row.lastStatusCode,
    lastStatusAt: row.lastStatusAt?.toISOString() ?? null,
  };
}

async function loadDeliveriesByOrder(orderIds: number[]): Promise<Map<number, DeliverySnapshot>> {
  const deliveriesByOrder = new Map<number, DeliverySnapshot>();
  if (orderIds.length === 0) {
    return deliveriesByOrder;
  }

  const rows: DeliveryRow[] = await requireDb()
    .select({
      orderId: orderDeliveries.orderId,
      provider: orderDeliveries.provider,
      status: orderDeliveries.status,
      cityCode: orderDeliveries.cityCode,
      cityName: orderDeliveries.cityName,
      pointCode: orderDeliveries.pointCode,
      pointAddress: orderDeliveries.pointAddress,
      recipientName: orderDeliveries.recipientName,
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
    })
    .from(orderDeliveries)
    .where(inArray(orderDeliveries.orderId, orderIds));

  for (const row of rows) {
    deliveriesByOrder.set(row.orderId, toDeliverySnapshot(row));
  }
  return deliveriesByOrder;
}

function toOrderSummary(
  row: OrderRow,
  items: OrderItem[],
  delivery: DeliverySnapshot | null,
): OrderSummary {
  return {
    id: row.id,
    shop: { slug: row.shopSlug, name: row.shopName },
    status: row.status,
    totalKopecks: row.totalKopecks,
    buyerPhone: row.buyerPhone,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    delivery,
    items,
  };
}

async function loadOrderSummaries(where: SQL): Promise<OrderSummary[]> {
  const rows: OrderRow[] = await requireDb()
    .select(orderColumns)
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .innerJoin(sellers, eq(shops.sellerId, sellers.id))
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id));

  const orderIds = rows.map((row) => row.id);
  const itemsByOrder = await loadItemsByOrder(orderIds);
  const deliveriesByOrder = await loadDeliveriesByOrder(orderIds);
  return rows.map((row) =>
    toOrderSummary(row, itemsByOrder.get(row.id) ?? [], deliveriesByOrder.get(row.id) ?? null),
  );
}

async function findOrdersByClientCheckoutId(
  buyerUserId: number,
  clientCheckoutId: string,
): Promise<OrderSummary[]> {
  const summaries = await loadOrderSummaries(
    matchAll(eq(orders.buyerUserId, buyerUserId), eq(orders.clientCheckoutId, clientCheckoutId)),
  );
  return summaries.sort((left, right) => left.id - right.id);
}

export type CheckoutError =
  "product_unavailable" | "delivery_required" | "delivery_unavailable" | "delivery_quote_stale";

export type CheckoutResult =
  { ok: true; orders: OrderSummary[] } | { ok: false; error: CheckoutError };

type PublishedProductRow = {
  id: number;
  name: string;
  priceKopecks: number;
  shopId: number;
  shopSlug: string;
  shopName: string;
};

function normalizeComment(comment: string | undefined): string | null {
  if (comment === undefined) {
    return null;
  }
  const trimmed = comment.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type CheckoutTransactionResult =
  | { kind: "existing" }
  | { kind: "unavailable" }
  | { kind: "delivery_required" }
  | { kind: "delivery_unavailable" }
  | { kind: "delivery_quote_stale" }
  | { kind: "created"; orders: OrderSummary[] };

/**
 * Creates one order per shop in a single transaction. Any product or shop that
 * is not published aborts the transaction with `product_unavailable`, so a
 * failed checkout never leaves a partial multi-shop order.
 *
 * Requests with the same `(buyer, clientCheckoutId)` are serialized by a
 * transaction-scoped advisory lock that is taken before anything else, so a
 * replay always returns the orders committed by the first request. The unique
 * constraint and the post-conflict read stay as a safety net.
 *
 * `clientCheckoutId` is lowercased here as well as in the request schema: the
 * lock key and the stored column must not depend on the UUID case a caller used.
 */
export async function checkout(user: AuthUser, input: Checkout): Promise<CheckoutResult> {
  const productIds = input.items.map((item) => item.productId);
  const buyerPhone = user.phone;
  const comment = normalizeComment(input.comment);
  const clientCheckoutId = input.clientCheckoutId.toLowerCase();
  const lockKey = `${user.id}:${clientCheckoutId}`;

  const delivery = input.delivery ?? null;

  try {
    const result = await requireDb().transaction(async (tx): Promise<CheckoutTransactionResult> => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      const [existingOrder] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.buyerUserId, user.id), eq(orders.clientCheckoutId, clientCheckoutId)))
        .limit(1);

      // A replay must return the orders created by the first request even if
      // the quote has expired or the cart changed since then. Delivery is
      // validated only for a new order.
      if (existingOrder) {
        return { kind: "existing" };
      }

      if (deliverySettings && !delivery) {
        return { kind: "delivery_required" };
      }

      let quoteByShop: Map<number, DeliveryQuoteShop> | null = null;
      let quotePayload: ReturnType<typeof verifyQuoteToken> = null;
      if (delivery) {
        if (!deliverySettings) {
          return { kind: "delivery_unavailable" };
        }
        quotePayload = verifyQuoteToken(delivery.quoteToken, deliverySettings.quoteSecret);
        if (
          !quotePayload ||
          quotePayload.productHash !== hashProductIds(productIds) ||
          quotePayload.cityCode !== delivery.cityCode ||
          quotePayload.pointCode !== delivery.pointCode
        ) {
          return { kind: "delivery_quote_stale" };
        }
        quoteByShop = new Map(quotePayload.shops.map((shop) => [shop.shopId, shop]));
      }

      const productRows: PublishedProductRow[] = await tx
        .select({
          id: products.id,
          name: products.name,
          priceKopecks: products.priceKopecks,
          shopId: products.shopId,
          shopSlug: shops.slug,
          shopName: shops.name,
        })
        .from(products)
        .innerJoin(shops, eq(products.shopId, shops.id))
        .where(
          and(
            inArray(products.id, productIds),
            eq(products.status, "published"),
            eq(shops.status, "published"),
          ),
        )
        .orderBy(products.id)
        .for("update", { of: products });

      if (productRows.length !== productIds.length) {
        return { kind: "unavailable" };
      }

      type ShopGroup = {
        shopId: number;
        shopSlug: string;
        shopName: string;
        items: PublishedProductRow[];
      };

      const groups = new Map<number, ShopGroup>();
      for (const row of productRows) {
        const group = groups.get(row.shopId) ?? {
          shopId: row.shopId,
          shopSlug: row.shopSlug,
          shopName: row.shopName,
          items: [],
        };
        group.items.push(row);
        groups.set(row.shopId, group);
      }

      if (quoteByShop && quoteByShop.size !== groups.size) {
        return { kind: "delivery_quote_stale" };
      }
      for (const group of groups.values()) {
        if (quoteByShop && !quoteByShop.has(group.shopId)) {
          return { kind: "delivery_quote_stale" };
        }
      }

      const summaries: OrderSummary[] = [];
      for (const group of [...groups.values()].sort((left, right) => left.shopId - right.shopId)) {
        const itemsTotalKopecks = group.items.reduce(
          (sum, product) => sum + product.priceKopecks,
          0,
        );
        const quote = quoteByShop?.get(group.shopId) ?? null;
        const deliveryKopecks = quote?.priceKopecks ?? 0;
        const totalKopecks = orderTotalKopecks(itemsTotalKopecks, deliveryKopecks);

        const [order] = await tx
          .insert(orders)
          .values({
            buyerUserId: user.id,
            shopId: group.shopId,
            totalKopecks,
            deliveryKopecks,
            buyerPhone,
            comment,
            clientCheckoutId,
          })
          .returning({
            id: orders.id,
            status: orders.status,
            totalKopecks: orders.totalKopecks,
            buyerPhone: orders.buyerPhone,
            comment: orders.comment,
            createdAt: orders.createdAt,
          });

        if (!order) {
          throw new Error("order insert returned no row");
        }

        await tx.insert(orderItems).values(
          group.items.map((product) => ({
            orderId: order.id,
            productId: product.id,
            name: product.name,
            priceKopecks: product.priceKopecks,
            quantity: 1,
          })),
        );

        let deliverySnapshot: DeliverySnapshot | null = null;
        if (quote && delivery && quotePayload) {
          deliverySnapshot = {
            provider: deliverySettings!.provider,
            status: "quoted",
            cityCode: quotePayload.cityCode,
            cityName: quotePayload.cityName,
            pointCode: quotePayload.pointCode,
            pointAddress: quotePayload.pointAddress,
            recipientName: delivery.recipientName,
            tariffCode: quote.tariffCode,
            tariffName: quote.tariffName,
            priceKopecks: quote.priceKopecks,
            periodMin: quote.periodMin,
            periodMax: quote.periodMax,
            providerOrderId: null,
            providerNumber: null,
            carrier: null,
            trackNumber: null,
            lastStatusCode: null,
            lastStatusAt: null,
          };

          await tx.insert(orderDeliveries).values({
            orderId: order.id,
            provider: deliverySnapshot.provider,
            status: "quoted",
            cityCode: deliverySnapshot.cityCode,
            cityName: deliverySnapshot.cityName,
            pointCode: deliverySnapshot.pointCode,
            pointAddress: deliverySnapshot.pointAddress,
            recipientName: deliverySnapshot.recipientName,
            recipientPhone: buyerPhone,
            providerTariffCode: deliverySnapshot.tariffCode,
            tariffName: deliverySnapshot.tariffName,
            priceKopecks: deliverySnapshot.priceKopecks,
            periodMin: deliverySnapshot.periodMin,
            periodMax: deliverySnapshot.periodMax,
          });
        }

        summaries.push(
          toOrderSummary(
            {
              ...order,
              shopSlug: group.shopSlug,
              shopName: group.shopName,
            },
            group.items.map((product) => ({
              productId: product.id,
              name: product.name,
              priceKopecks: product.priceKopecks,
              quantity: 1,
            })),
            deliverySnapshot,
          ),
        );
      }

      return { kind: "created", orders: summaries };
    });

    if (result.kind === "existing") {
      return {
        ok: true,
        orders: await findOrdersByClientCheckoutId(user.id, clientCheckoutId),
      };
    }

    if (result.kind === "unavailable") {
      return { ok: false, error: "product_unavailable" };
    }
    if (result.kind === "delivery_required") {
      return { ok: false, error: "delivery_required" };
    }
    if (result.kind === "delivery_unavailable") {
      return { ok: false, error: "delivery_unavailable" };
    }
    if (result.kind === "delivery_quote_stale") {
      return { ok: false, error: "delivery_quote_stale" };
    }
    if (result.kind !== "created") {
      throw new Error("unexpected checkout result");
    }

    return { ok: true, orders: result.orders };
  } catch (error) {
    if (isCheckoutIdempotencyConflict(error)) {
      const existingAfterRace = await findOrdersByClientCheckoutId(user.id, clientCheckoutId);
      if (existingAfterRace.length > 0) {
        return { ok: true, orders: existingAfterRace };
      }
    }
    throw error;
  }
}

export function listBuyerOrders(userId: number): Promise<OrderSummary[]> {
  return loadOrderSummaries(eq(orders.buyerUserId, userId));
}

export async function getBuyerOrder(userId: number, orderId: number): Promise<OrderSummary | null> {
  const [order] = await loadOrderSummaries(
    matchAll(eq(orders.buyerUserId, userId), eq(orders.id, orderId)),
  );
  return order ?? null;
}

export function listSellerOrders(userId: number): Promise<OrderSummary[]> {
  return loadOrderSummaries(eq(sellers.userId, userId));
}

export async function getSellerOrder(
  userId: number,
  orderId: number,
): Promise<OrderSummary | null> {
  const [order] = await loadOrderSummaries(
    matchAll(eq(sellers.userId, userId), eq(orders.id, orderId)),
  );
  return order ?? null;
}

function isCheckoutIdempotencyConflict(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current !== null && current !== undefined; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }

    const { code, constraint, cause } = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      code === "23505" &&
      constraint === "orders_buyer_user_id_client_checkout_id_shop_id_unique"
    ) {
      return true;
    }
    current = cause;
  }

  return false;
}
