import { describe, expect, it } from "vitest";
import {
  CheckoutResponseSchema,
  CheckoutSchema,
  ORDER_COMMENT_MAX_LENGTH,
  ORDER_ID_MAX,
  ORDER_MAX_ITEMS,
  ORDER_STATUS_LABELS,
  ORDER_TOTAL_MAX_KOPECKS,
  OrderItemSchema,
  OrderListResponseSchema,
  OrderResponseSchema,
  OrderStatusSchema,
  OrderSummarySchema,
} from "./order.js";

const clientCheckoutId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

function testPhone(prefix = "+7"): string {
  return [prefix, "999", "0000001"].join("");
}

function checkoutWith(itemCount: number) {
  return {
    items: Array.from({ length: itemCount }, (_, index) => ({ productId: index + 1 })),
    clientCheckoutId,
  };
}

const summary = {
  id: 1,
  shop: { slug: "vintage-shop", name: "Винтаж на районе" },
  status: "new",
  totalKopecks: 420_000,
  buyerPhone: testPhone(),
  comment: "Позвонить перед доставкой",
  createdAt: "2026-11-27T10:00:00.000Z",
  delivery: null,
  items: [
    {
      productId: 5,
      name: "Куртка 90-х",
      priceKopecks: 420_000,
      quantity: 1,
    },
  ],
};

describe("OrderStatusSchema", () => {
  it("accepts the payment-aware order statuses", () => {
    expect(OrderStatusSchema.options).toEqual(["new", "payment_pending", "paid"]);
    for (const status of OrderStatusSchema.options) {
      expect(OrderStatusSchema.parse(status)).toBe(status);
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("keeps manual_review as a payment status, not an order status", () => {
    expect(OrderStatusSchema.safeParse("manual_review").success).toBe(false);
  });

  it("rejects unknown order statuses", () => {
    expect(OrderStatusSchema.safeParse("confirmed").success).toBe(false);
    expect(OrderStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("CheckoutSchema", () => {
  it("parses the minimal checkout and trims a comment", () => {
    expect(CheckoutSchema.parse({ ...checkoutWith(1), comment: "  Позвонить  " })).toEqual({
      ...checkoutWith(1),
      comment: "Позвонить",
    });
  });

  it("accepts the item and comment boundaries", () => {
    expect(CheckoutSchema.safeParse(checkoutWith(ORDER_MAX_ITEMS)).success).toBe(true);
    expect(
      CheckoutSchema.safeParse({
        ...checkoutWith(1),
        comment: "a".repeat(ORDER_COMMENT_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });

  it.each([
    { items: [] },
    { items: checkoutWith(ORDER_MAX_ITEMS + 1).items },
    { items: [{ productId: 1 }, { productId: 1 }] },
    { items: [{ productId: 0 }] },
    { items: [{ productId: 1.5 }] },
    { items: [{ productId: ORDER_ID_MAX + 1 }] },
    { items: [{ productId: "1" }] },
    { items: [{}] },
    { items: [{ productId: 1 }], comment: "a".repeat(ORDER_COMMENT_MAX_LENGTH + 1) },
    { items: [{ productId: 1 }], comment: "A\u0000B" },
    { items: [{ productId: 1 }], clientCheckoutId: "not-a-uuid" },
  ])("rejects invalid checkout %#", (input) => {
    expect(CheckoutSchema.safeParse(input).success).toBe(false);
  });

  it("requires clientCheckoutId", () => {
    expect(CheckoutSchema.safeParse({ items: [{ productId: 1 }] }).success).toBe(false);
  });

  it("canonicalizes an upper-case clientCheckoutId to lowercase", () => {
    expect(
      CheckoutSchema.parse({
        ...checkoutWith(1),
        clientCheckoutId: clientCheckoutId.toUpperCase(),
      }).clientCheckoutId,
    ).toBe(clientCheckoutId);
  });
});

describe("OrderSummarySchema", () => {
  it("parses an order with items and a null comment", () => {
    expect(OrderSummarySchema.parse({ ...summary, comment: null })).toEqual({
      ...summary,
      comment: null,
    });
  });

  it("accepts a null productId after the product is deleted", () => {
    expect(OrderItemSchema.parse({ ...summary.items[0], productId: null }).productId).toBeNull();
  });

  it("accepts totals beyond int4 up to the JS safe integer", () => {
    expect(OrderSummarySchema.parse({ ...summary, totalKopecks: 4_294_967_294 }).totalKopecks).toBe(
      4_294_967_294,
    );
    expect(
      OrderSummarySchema.parse({ ...summary, totalKopecks: ORDER_TOTAL_MAX_KOPECKS }).totalKopecks,
    ).toBe(ORDER_TOTAL_MAX_KOPECKS);
  });

  it("rejects totals outside the safe integer range and keeps item prices at int4", () => {
    expect(
      OrderSummarySchema.safeParse({ ...summary, totalKopecks: ORDER_TOTAL_MAX_KOPECKS + 1 })
        .success,
    ).toBe(false);
    expect(OrderSummarySchema.safeParse({ ...summary, totalKopecks: 1.5 }).success).toBe(false);
    expect(
      OrderSummarySchema.safeParse({
        ...summary,
        items: [{ ...summary.items[0], priceKopecks: ORDER_ID_MAX + 1 }],
      }).success,
    ).toBe(false);
  });

  it("accepts an order in every payment-aware status", () => {
    for (const status of ["new", "payment_pending", "paid"] as const) {
      expect(OrderSummarySchema.parse({ ...summary, status }).status).toBe(status);
    }
  });

  it.each([
    { ...summary, totalKopecks: -1 },
    { ...summary, buyerPhone: testPhone("8") },
    { ...summary, createdAt: "2026-11-27" },
    { ...summary, items: [] },
    { ...summary, items: [{ ...summary.items[0], quantity: 2 }] },
    { ...summary, items: [{ ...summary.items[0], name: "" }] },
    { ...summary, items: [{ ...summary.items[0], priceKopecks: -1 }] },
    { ...summary, items: [{ ...summary.items[0], productId: null, name: "" }] },
  ])("rejects invalid order %#", (input) => {
    expect(OrderSummarySchema.safeParse(input).success).toBe(false);
  });
});

describe("order response contracts", () => {
  it("parses checkout, list and detail responses", () => {
    expect(CheckoutResponseSchema.parse({ orders: [summary] })).toEqual({ orders: [summary] });
    expect(OrderListResponseSchema.parse({ orders: [] })).toEqual({ orders: [] });
    expect(OrderResponseSchema.parse({ order: summary })).toEqual({ order: summary });
  });

  it("rejects responses without the required collection", () => {
    expect(CheckoutResponseSchema.safeParse({ order: summary }).success).toBe(false);
    expect(OrderResponseSchema.safeParse({ orders: [summary] }).success).toBe(false);
  });
});
