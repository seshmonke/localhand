import {
  type CatalogQuery,
  CatalogResponseSchema,
  type Checkout,
  CheckoutResponseSchema,
  type CreateProduct,
  CreatePaymentResponseSchema,
  type CreateShop,
  type DeliveryQuoteRequest,
  DeliveryCityListResponseSchema,
  DeliveryPointListResponseSchema,
  DeliveryQuoteResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  MeResponseSchema,
  OrderListResponseSchema,
  OrderPaymentResponseSchema,
  OrderResponseSchema,
  PaymentConnectResponseSchema,
  ProductDetailSchema,
  type RequestCodeRequest,
  RequestCodeResponseSchema,
  SellerPaymentAccountResponseSchema,
  SellerProductListResponseSchema,
  SellerProductResponseSchema,
  SellerShopResponseSchema,
  ShopPageSchema,
  type UpdateProduct,
  type UpdateShop,
  type VerifyCodeRequest,
  VerifyCodeResponseSchema,
} from "@localhand/shared";

type Parser<T> = {
  parse: (input: unknown) => T;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export class ApiNotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "ApiNotFoundError";
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Request failed: ${status} ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorCode(payload: unknown): string {
  if (typeof payload === "object" && payload !== null) {
    const { error } = payload as { error?: unknown };
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
  }
  return "request_failed";
}

export async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
  schema?: Parser<T>,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await readJson(response);

  if (!response.ok) {
    throw new ApiError(response.status, readErrorCode(payload));
  }

  if (!schema) {
    return payload as T;
  }

  return schema.parse(payload);
}

async function getJson<T>(path: string, schema: Parser<T>): Promise<T> {
  try {
    return await requestJson(path, {}, schema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiNotFoundError();
    }
    throw error;
  }
}

export function fetchCatalog(query: CatalogQuery) {
  const params = new URLSearchParams({
    sort: query.sort,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) {
    params.set("q", query.q);
  }

  return getJson(`/catalog/products?${params.toString()}`, CatalogResponseSchema);
}

export function fetchShop(slug: string) {
  return getJson(`/shops/${encodeURIComponent(slug)}`, ShopPageSchema);
}

export function fetchProduct(id: number) {
  return getJson(`/products/${id}`, ProductDetailSchema);
}

export function fetchMe() {
  return requestJson("/auth/me", {}, MeResponseSchema);
}

export function requestCode(input: RequestCodeRequest) {
  return requestJson(
    "/auth/request-code",
    { method: "POST", body: input },
    RequestCodeResponseSchema,
  );
}

export function verifyCode(input: VerifyCodeRequest) {
  return requestJson(
    "/auth/verify-code",
    { method: "POST", body: input },
    VerifyCodeResponseSchema,
  );
}

export function logout(): Promise<void> {
  return requestJson("/auth/logout", { method: "POST" });
}

export function fetchSellerShop() {
  return requestJson("/seller/shop", {}, SellerShopResponseSchema);
}

export function createShop(input: CreateShop) {
  return requestJson("/seller/shop", { method: "POST", body: input }, SellerShopResponseSchema);
}

export function updateShop(input: UpdateShop) {
  return requestJson("/seller/shop", { method: "PATCH", body: input }, SellerShopResponseSchema);
}

export function fetchSellerProducts() {
  return requestJson("/seller/products", {}, SellerProductListResponseSchema);
}

export function createProduct(input: CreateProduct) {
  return requestJson(
    "/seller/products",
    { method: "POST", body: input },
    SellerProductResponseSchema,
  );
}

export function updateProduct(id: number, input: UpdateProduct) {
  return requestJson(
    `/seller/products/${encodeURIComponent(String(id))}`,
    { method: "PATCH", body: input },
    SellerProductResponseSchema,
  );
}

export function fetchDeliveryCities(query: string) {
  const params = new URLSearchParams();
  if (query) {
    params.set("query", query);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson(`/delivery/cities${suffix}`, {}, DeliveryCityListResponseSchema);
}

export function fetchDeliveryPoints(cityCode: number) {
  const params = new URLSearchParams({ cityCode: String(cityCode) });
  return requestJson(`/delivery/points?${params.toString()}`, {}, DeliveryPointListResponseSchema);
}

export function fetchDeliveryQuote(input: DeliveryQuoteRequest) {
  return requestJson(
    "/delivery/quote",
    { method: "POST", body: input },
    DeliveryQuoteResponseSchema,
  );
}

export function checkout(input: Checkout) {
  return requestJson("/checkout", { method: "POST", body: input }, CheckoutResponseSchema);
}

export function fetchMyOrders() {
  return requestJson("/orders/mine", {}, OrderListResponseSchema);
}

export function fetchOrder(id: number) {
  return requestJson(`/orders/${encodeURIComponent(String(id))}`, {}, OrderResponseSchema);
}

export function fetchSellerOrders() {
  return requestJson("/seller/orders", {}, OrderListResponseSchema);
}

export function fetchSellerOrder(id: number) {
  return requestJson(`/seller/orders/${encodeURIComponent(String(id))}`, {}, OrderResponseSchema);
}

export function fetchSellerPaymentAccount() {
  return requestJson("/seller/payments/account", {}, SellerPaymentAccountResponseSchema);
}

export function connectSellerPayments() {
  return requestJson("/seller/payments/connect", { method: "POST" }, PaymentConnectResponseSchema);
}

export function completeSellerPaymentConnection(code: string, state: string) {
  const params = new URLSearchParams({ code, state });
  return requestJson(
    `/seller/payments/callback?${params.toString()}`,
    {},
    SellerPaymentAccountResponseSchema,
  );
}

export function disconnectSellerPayments() {
  return requestJson(
    "/seller/payments/account",
    { method: "DELETE" },
    SellerPaymentAccountResponseSchema,
  );
}

export function fetchOrderPayment(orderId: number) {
  return requestJson(
    `/orders/${encodeURIComponent(String(orderId))}/payment`,
    {},
    OrderPaymentResponseSchema,
  );
}

export function createOrderPayment(orderId: number, idempotencyKey: string) {
  return requestJson(
    `/orders/${encodeURIComponent(String(orderId))}/payments`,
    {
      method: "POST",
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    },
    CreatePaymentResponseSchema,
  );
}

export function fetchSellerOrderPayment(orderId: number) {
  return requestJson(
    `/seller/orders/${encodeURIComponent(String(orderId))}/payment`,
    {},
    OrderPaymentResponseSchema,
  );
}

/** Dev-only fake payment hook. The route exists only with the fake provider. */
export function completeDevPayment(paymentId: number) {
  return requestJson<{ ok: true; orderId: number; providerPaymentId: string }>(
    `/dev/payments/${encodeURIComponent(String(paymentId))}/complete`,
    { method: "POST" },
  );
}

/** Dev-only helper: drive the real webhook after a fake completion. */
export function sendPaymentWebhook(providerPaymentId: string) {
  return requestJson<{ ok: true }>("/payments/yookassa/webhook", {
    method: "POST",
    body: {
      type: "payment.succeeded",
      event: "payment.succeeded",
      object: { id: providerPaymentId, status: "succeeded" },
    },
  });
}
