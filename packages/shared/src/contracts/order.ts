import { z } from "zod";
import { DeliveryCheckoutSchema, DeliverySnapshotSchema } from "./delivery.js";
import { ORDER_ID_MAX, ORDER_MAX_ITEMS, ORDER_TOTAL_MAX_KOPECKS } from "./limits.js";
import { ShopSummarySchema } from "./storefront.js";

export { ORDER_ID_MAX, ORDER_MAX_ITEMS, ORDER_TOTAL_MAX_KOPECKS };

export const ORDER_COMMENT_MAX_LENGTH = 500;
export const ORDER_ITEM_NAME_MAX_LENGTH = 120;

function hasNoNulByte(value: string): boolean {
  return !value.includes("\u0000");
}

const NUL_BYTE_MESSAGE = { message: "nul_byte" };

export const OrderIdSchema = z.coerce.number().int().positive().max(ORDER_ID_MAX);

export const OrderCommentSchema = z
  .string()
  .trim()
  .max(ORDER_COMMENT_MAX_LENGTH)
  .refine(hasNoNulByte, NUL_BYTE_MESSAGE);

export const CheckoutItemSchema = z.object({
  productId: z.number().int().positive().max(ORDER_ID_MAX),
});

export const CheckoutSchema = z.object({
  items: z
    .array(CheckoutItemSchema)
    .min(1)
    .max(ORDER_MAX_ITEMS)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, {
      message: "duplicate_product",
    }),
  comment: OrderCommentSchema.optional(),
  // UUIDs are case-insensitive by spec, but the replay query, the unique key and
  // the advisory lock compare strings byte-wise. Canonical lowercase makes the
  // same id produce the same row lookup and the same lock in every case.
  clientCheckoutId: z.uuid().transform((value) => value.toLowerCase()),
  delivery: DeliveryCheckoutSchema.optional(),
});

export const ORDER_STATUSES = ["new", "payment_pending", "paid"] as const;

export const OrderStatusSchema = z.enum(ORDER_STATUSES);

/**
 * Checkout always creates `new`. `payment_pending` appears while a payment is
 * waiting for provider confirmation; `paid` is terminal. The payment status
 * `manual_review` is a badge on the payment, never an order status.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  payment_pending: "Ожидает оплаты",
  paid: "Оплачен",
};

export const OrderItemSchema = z.object({
  productId: z.number().int().positive().max(ORDER_ID_MAX).nullable(),
  name: z.string().min(1).max(ORDER_ITEM_NAME_MAX_LENGTH),
  priceKopecks: z.number().int().min(0).max(ORDER_ID_MAX),
  quantity: z.literal(1),
});

export const OrderSummarySchema = z.object({
  id: z.number().int().positive().max(ORDER_ID_MAX),
  shop: ShopSummarySchema,
  status: OrderStatusSchema,
  totalKopecks: z.number().int().min(0).max(ORDER_TOTAL_MAX_KOPECKS),
  buyerPhone: z.string().regex(/^\+7\d{10}$/),
  comment: z.string().max(ORDER_COMMENT_MAX_LENGTH).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  delivery: DeliverySnapshotSchema.nullable(),
  items: z.array(OrderItemSchema).min(1),
});

export const CheckoutResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
});

export const OrderListResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
});

export const OrderResponseSchema = z.object({
  order: OrderSummarySchema,
});

export type CheckoutItem = z.infer<typeof CheckoutItemSchema>;
export type Checkout = z.infer<typeof CheckoutSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;
export type OrderResponse = z.infer<typeof OrderResponseSchema>;
