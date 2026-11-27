import {
  type CreateProduct,
  type CreateShop,
  MeResponseSchema,
  ProductDetailSchema,
  ProductListResponseSchema,
  type RequestCodeRequest,
  RequestCodeResponseSchema,
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
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
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
  const headers: Record<string, string> = { Accept: "application/json" };
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

export function fetchCatalog() {
  return getJson("/catalog/products", ProductListResponseSchema);
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
