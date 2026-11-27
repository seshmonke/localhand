import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import {
  loginViaApi,
  createPublishedCatalog,
  uniquePhone,
  type ApiSession,
  type CatalogFixture,
} from "./helpers.js";

/**
 * Fixtures for the fake-provider payments flow. These calls go through the
 * public API only (no direct SQL), so the browser and API layers see exactly
 * the same state machine as production.
 */

export type PaymentsFixture = {
  catalog: CatalogFixture;
  buyer: ApiSession;
  orderId: number;
};

export async function createOrder(
  request: APIRequestContext,
  catalog: CatalogFixture,
  buyer: ApiSession,
): Promise<number> {
  const product = catalog.products[0];
  if (!product) {
    throw new Error("catalog fixture did not create a product");
  }
  const response = await request.post("/api/checkout", {
    headers: { cookie: buyer.cookie },
    data: { items: [{ productId: product.id }], clientCheckoutId: randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(201);
  const payload = (await response.json()) as { orders: Array<{ id: number }> };
  const orderId = payload.orders[0]?.id;
  if (!orderId) {
    throw new Error("checkout did not return an order");
  }
  return orderId;
}

/** Connects the fake provider through the API for tests that only need state. */
export async function connectPaymentsViaApi(
  request: APIRequestContext,
  seller: ApiSession,
): Promise<void> {
  const connect = await request.post("/api/seller/payments/connect", {
    headers: { cookie: seller.cookie },
  });
  expect(connect.status(), await connect.text()).toBe(200);
  const { consentUrl } = (await connect.json()) as { consentUrl: string };
  const state = new URL(consentUrl).searchParams.get("state");
  expect(state, "fake consent URL must carry a state").toBeTruthy();

  const callback = await request.get(
    `/api/seller/payments/callback?code=e2e-${randomUUID()}&state=${encodeURIComponent(state ?? "")}`,
    { headers: { cookie: seller.cookie } },
  );
  expect(callback.status(), await callback.text()).toBe(200);
}

export async function createPendingPayment(
  request: APIRequestContext,
  buyer: ApiSession,
  orderId: number,
): Promise<void> {
  const response = await request.post(`/api/orders/${orderId}/payments`, {
    headers: { cookie: buyer.cookie, "Idempotency-Key": randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(201);
}

/** A full fixture with a connected seller, a buyer, an order and a pending payment. */
export async function createPaymentsFixture(
  request: APIRequestContext,
  productName = "E2E Оплата",
): Promise<PaymentsFixture> {
  const catalog = await createPublishedCatalog(request, [productName]);
  const buyer = await loginViaApi(request, uniquePhone());
  await connectPaymentsViaApi(request, catalog.seller);
  const orderId = await createOrder(request, catalog, buyer);
  await createPendingPayment(request, buyer, orderId);
  return { catalog, buyer, orderId };
}

export function manualReviewPaymentBody(): string {
  return JSON.stringify({
    payment: {
      id: 999_001,
      status: "manual_review",
      amountKopecks: 100_000,
      currency: "RUB",
      confirmationUrl: null,
      createdAt: new Date().toISOString(),
      paidAt: null,
    },
  });
}
