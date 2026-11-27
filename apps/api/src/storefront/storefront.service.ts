import type {
  CatalogQuery,
  CatalogResponse,
  ProductCard,
  ProductDetail,
  ShopPage,
} from "@localhand/shared";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { products, shops } from "../db/schema.js";

export type ProductRow = {
  id: number;
  name: string;
  priceKopecks: number;
  imageUrl: string | null;
  shopSlug: string;
  shopName: string;
};

export function toProductCard(row: ProductRow): ProductCard {
  return {
    id: row.id,
    name: row.name,
    priceKopecks: row.priceKopecks,
    imageUrl: row.imageUrl,
    shop: {
      slug: row.shopSlug,
      name: row.shopName,
    },
  };
}

const productColumns = {
  id: products.id,
  name: products.name,
  priceKopecks: products.priceKopecks,
  imageUrl: products.imageUrl,
  shopSlug: shops.slug,
  shopName: shops.name,
};

/**
 * Escapes LIKE wildcards so a buyer searching for "%" or "_" gets a literal
 * match instead of every product. PostgreSQL uses the backslash as the default
 * LIKE escape character.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function catalogWhere(query: CatalogQuery) {
  const conditions: SQL[] = [eq(products.status, "published"), eq(shops.status, "published")];

  if (query.q) {
    const pattern = `%${escapeLikePattern(query.q)}%`;
    const search = or(ilike(products.name, pattern), ilike(shops.name, pattern));
    if (search) {
      conditions.push(search);
    }
  }

  return and(...conditions);
}

function catalogOrder(query: CatalogQuery): SQL[] {
  if (query.sort === "price_asc") {
    return [asc(products.priceKopecks), desc(products.id)];
  }
  if (query.sort === "price_desc") {
    return [desc(products.priceKopecks), desc(products.id)];
  }
  return [desc(products.createdAt), desc(products.id)];
}

export async function listPublishedProducts(query: CatalogQuery): Promise<CatalogResponse> {
  const db = requireDb();
  const where = catalogWhere(query);

  const [totalRow] = await db
    .select({ total: count() })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(where);

  const total = totalRow?.total ?? 0;
  const offset = (query.page - 1) * query.pageSize;
  const hasMore = query.page * query.pageSize < total;

  const rows =
    Number.isSafeInteger(offset) && offset < total
      ? await db
          .select(productColumns)
          .from(products)
          .innerJoin(shops, eq(products.shopId, shops.id))
          .where(where)
          .orderBy(...catalogOrder(query))
          .limit(query.pageSize)
          .offset(offset)
      : [];

  return {
    products: rows.map(toProductCard),
    page: query.page,
    pageSize: query.pageSize,
    total,
    hasMore,
  };
}

export async function getPublishedShop(slug: string): Promise<ShopPage | null> {
  const [shop] = await requireDb()
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      description: shops.description,
    })
    .from(shops)
    .where(and(eq(shops.slug, slug), eq(shops.status, "published")))
    .limit(1);

  if (!shop) {
    return null;
  }

  const rows = await requireDb()
    .select(productColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.shopId, shop.id), eq(products.status, "published")))
    .orderBy(desc(products.createdAt));

  return {
    slug: shop.slug,
    name: shop.name,
    description: shop.description,
    products: rows.map(toProductCard),
  };
}

export async function getPublishedProduct(id: number): Promise<ProductDetail | null> {
  const [row] = await requireDb()
    .select({
      ...productColumns,
      description: products.description,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(eq(products.id, id), eq(products.status, "published"), eq(shops.status, "published")),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...toProductCard(row),
    description: row.description,
  };
}
