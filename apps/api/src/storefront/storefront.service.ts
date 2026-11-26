import type { ProductCard, ProductDetail, ShopPage } from "@localhand/shared";
import { and, desc, eq } from "drizzle-orm";
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

export async function listPublishedProducts(): Promise<ProductCard[]> {
  const rows = await requireDb()
    .select(productColumns)
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(and(eq(products.status, "published"), eq(shops.status, "published")))
    .orderBy(desc(products.createdAt))
    .limit(100);

  return rows.map(toProductCard);
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
