import type { CreateShop, SellerShop, UpdateShop } from "@localhand/shared";
import { eq } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { sellers, shops } from "../db/schema.js";

type ShopRow = Pick<
  typeof shops.$inferSelect,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "status"
  | "cdekCityCode"
  | "cdekCityName"
  | "cdekShipmentPoint"
>;

export function toSellerShop(row: ShopRow): SellerShop {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    cdekCityCode: row.cdekCityCode,
    cdekCityName: row.cdekCityName,
    cdekShipmentPoint: row.cdekShipmentPoint,
    status: row.status,
  };
}

export async function getShopByUserId(userId: number): Promise<SellerShop | null> {
  const [row] = await requireDb()
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      description: shops.description,
      status: shops.status,
      cdekCityCode: shops.cdekCityCode,
      cdekCityName: shops.cdekCityName,
      cdekShipmentPoint: shops.cdekShipmentPoint,
    })
    .from(shops)
    .innerJoin(sellers, eq(shops.sellerId, sellers.id))
    .where(eq(sellers.userId, userId))
    .limit(1);

  return row ? toSellerShop(row) : null;
}

export type CreateShopResult =
  { ok: true; shop: SellerShop } | { ok: false; error: "shop_exists" | "slug_taken" };

export async function createShop(userId: number, input: CreateShop): Promise<CreateShopResult> {
  const db = requireDb();

  try {
    return await db.transaction(async (tx) => {
      const [createdSeller] = await tx
        .insert(sellers)
        .values({ displayName: input.name, userId })
        .onConflictDoNothing({ target: sellers.userId })
        .returning({ id: sellers.id });

      const existingSellers: Array<{ id: number }> = createdSeller
        ? [createdSeller]
        : await tx
            .select({ id: sellers.id })
            .from(sellers)
            .where(eq(sellers.userId, userId))
            .limit(1);

      const seller = existingSellers[0];

      if (!seller) {
        throw new Error("seller could not be created or loaded");
      }

      const [shop] = await tx
        .insert(shops)
        .values({
          sellerId: seller.id,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
        })
        .returning();

      if (!shop) {
        throw new Error("shop insert returned no row");
      }

      return { ok: true as const, shop: toSellerShop(shop) };
    });
  } catch (error) {
    const constraint = uniqueViolationConstraint(error);
    if (constraint === "shops_slug_unique") {
      return { ok: false, error: "slug_taken" };
    }
    if (constraint === "shops_seller_id_unique" || constraint === "sellers_user_id_unique") {
      return { ok: false, error: "shop_exists" };
    }
    throw error;
  }
}

export type UpdateShopResult =
  | { ok: true; shop: SellerShop }
  | { ok: false; error: "not_found" | "slug_taken" | "shop_blocked" | "shop_city_missing" };

export async function updateShop(userId: number, input: UpdateShop): Promise<UpdateShopResult> {
  const db = requireDb();

  const [existing] = await db
    .select({
      id: shops.id,
      status: shops.status,
      cdekCityCode: shops.cdekCityCode,
      cdekShipmentPoint: shops.cdekShipmentPoint,
    })
    .from(shops)
    .innerJoin(sellers, eq(shops.sellerId, sellers.id))
    .where(eq(sellers.userId, userId))
    .limit(1);

  if (!existing) {
    return { ok: false, error: "not_found" };
  }

  if (existing.status === "blocked") {
    return { ok: false, error: "shop_blocked" };
  }

  const changes: Partial<typeof shops.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    changes.name = input.name;
  }
  if (input.slug !== undefined) {
    changes.slug = input.slug;
  }
  if (input.description !== undefined) {
    changes.description = input.description;
  }
  if (input.cdekCityCode !== undefined) {
    changes.cdekCityCode = input.cdekCityCode;
    if (input.cdekCityCode === null) {
      // Clearing the city must clear every dependent origin field.
      changes.cdekCityName = null;
      changes.cdekShipmentPoint = null;
    } else if (input.cdekCityCode !== existing.cdekCityCode) {
      // A different city invalidates the old name/point unless the same
      // request supplies replacements. This prevents a PVZ from another city.
      changes.cdekCityName = input.cdekCityName ?? null;
      changes.cdekShipmentPoint = input.cdekShipmentPoint ?? null;
    }
  }
  if (input.cdekCityName !== undefined) {
    changes.cdekCityName = input.cdekCityName;
  }
  if (input.cdekShipmentPoint !== undefined) {
    changes.cdekShipmentPoint = input.cdekShipmentPoint;
  }

  const nextCityCode =
    changes.cdekCityCode !== undefined ? changes.cdekCityCode : existing.cdekCityCode;
  const nextPoint =
    changes.cdekShipmentPoint !== undefined
      ? changes.cdekShipmentPoint
      : existing.cdekShipmentPoint;
  if (nextPoint !== null && nextPoint !== undefined && nextCityCode === null) {
    return { ok: false, error: "shop_city_missing" };
  }
  if (input.status !== undefined) {
    changes.status = input.status;
  }

  try {
    const [shop] = await db.update(shops).set(changes).where(eq(shops.id, existing.id)).returning();

    if (!shop) {
      return { ok: false, error: "not_found" };
    }

    return { ok: true, shop: toSellerShop(shop) };
  } catch (error) {
    if (uniqueViolationConstraint(error) === "shops_slug_unique") {
      return { ok: false, error: "slug_taken" };
    }
    throw error;
  }
}

function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;

  for (let depth = 0; depth < 3 && current !== null && current !== undefined; depth += 1) {
    if (typeof current !== "object") {
      return null;
    }

    const { code, constraint, cause } = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (code === "23505" && typeof constraint === "string") {
      return constraint;
    }
    current = cause;
  }

  return null;
}
