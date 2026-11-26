import { ProductDetailSchema, ProductListResponseSchema, ShopPageSchema } from "@localhand/shared";

type Parser<T> = {
  parse: (input: unknown) => T;
};

export class ApiNotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "ApiNotFoundError";
  }
}

async function getJson<T>(path: string, schema: Parser<T>): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    throw new ApiNotFoundError();
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return schema.parse(await response.json());
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
