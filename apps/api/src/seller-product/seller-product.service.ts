import type { CreateProduct, SellerProduct, UpdateProduct } from "@localhand/shared";
import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { products, sellers, shops } from "../db/schema.js";
import { getShopByUserId } from "../seller-shop/seller-shop.service.js";

type ProductRow = Pick<
  typeof products.$inferSelect,
  "id" | "name" | "description" | "priceKopecks" | "imageUrl" | "status"
>;

export function toSellerProduct(row: ProductRow): SellerProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceKopecks: row.priceKopecks,
    imageUrl: row.imageUrl,
    status: row.status,
  };
}

const productColumns = {
  id: products.id,
  name: products.name,
  description: products.description,
  priceKopecks: products.priceKopecks,
  imageUrl: products.imageUrl,
  status: products.status,
};

/** Lists every product of the seller's shop, all statuses, newest update first. */
export async function listSellerProducts(userId: number): Promise<SellerProduct[]> {
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return [];
  }

  const rows = await requireDb()
    .select(productColumns)
    .from(products)
    .where(eq(products.shopId, shop.id))
    .orderBy(desc(products.updatedAt), desc(products.id));

  return rows.map(toSellerProduct);
}

export type CreateProductResult =
  { ok: true; product: SellerProduct } | { ok: false; error: "shop_required" };

export async function createProduct(
  userId: number,
  input: CreateProduct,
): Promise<CreateProductResult> {
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return { ok: false, error: "shop_required" };
  }

  const [row] = await requireDb()
    .insert(products)
    .values({
      shopId: shop.id,
      name: input.name,
      description: input.description ?? null,
      priceKopecks: input.priceKopecks,
      imageUrl: input.imageUrl ?? null,
      status: "draft",
    })
    .returning(productColumns);

  if (!row) {
    throw new Error("product insert returned no row");
  }

  return { ok: true, product: toSellerProduct(row) };
}

export type UpdateSellerProductResult =
  { ok: true; product: SellerProduct } | { ok: false; error: "not_found" | "shop_not_published" };

export async function updateSellerProduct(
  userId: number,
  productId: number,
  input: UpdateProduct,
): Promise<UpdateSellerProductResult> {
  const db = requireDb();

  const [existing] = await db
    .select({ id: products.id, status: products.status, shopStatus: shops.status })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .innerJoin(sellers, eq(shops.sellerId, sellers.id))
    .where(and(eq(products.id, productId), eq(sellers.userId, userId)))
    .limit(1);

  if (!existing) {
    return { ok: false, error: "not_found" };
  }

  // Publishing is a transition: re-sending `published` for an already
  // published product must not block unrelated edits while the shop is a draft.
  if (
    input.status === "published" &&
    existing.status !== "published" &&
    existing.shopStatus !== "published"
  ) {
    return { ok: false, error: "shop_not_published" };
  }

  const changes: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    changes.name = input.name;
  }
  if (input.description !== undefined) {
    changes.description = input.description;
  }
  if (input.priceKopecks !== undefined) {
    changes.priceKopecks = input.priceKopecks;
  }
  if (input.imageUrl !== undefined) {
    changes.imageUrl = input.imageUrl;
  }
  if (input.status !== undefined) {
    changes.status = input.status;
  }

  const [row] = await db
    .update(products)
    .set(changes)
    .where(eq(products.id, existing.id))
    .returning(productColumns);

  if (!row) {
    return { ok: false, error: "not_found" };
  }

  return { ok: true, product: toSellerProduct(row) };
}
