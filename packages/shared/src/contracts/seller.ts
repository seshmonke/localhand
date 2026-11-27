import { z } from "zod";

const SHOP_SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;
const CDEK_CITY_NAME_MAX_LENGTH = 120;
const CDEK_POINT_CODE_MAX_LENGTH = 64;

export const reservedShopSlugs = [
  "admin",
  "api",
  "auth",
  "login",
  "shops",
  "products",
  "catalog",
  "static",
  "assets",
] as const;

export type ReservedShopSlug = (typeof reservedShopSlugs)[number];

export function isReservedShopSlug(slug: string): boolean {
  return (reservedShopSlugs as readonly string[]).includes(slug);
}

/**
 * Validates a public shop slug: 3–40 lowercase latin letters, digits and
 * hyphens, no leading/trailing hyphen, not reserved.
 */
export function isValidShopSlug(slug: string): boolean {
  return (
    SHOP_SLUG_PATTERN.test(slug) &&
    !slug.startsWith("-") &&
    !slug.endsWith("-") &&
    !isReservedShopSlug(slug)
  );
}

export const ShopSlugSchema = z.string().refine(isValidShopSlug, { message: "invalid_slug" });

export const ShopNameSchema = z.string().trim().min(1).max(80);

export const ShopDescriptionSchema = z.string().max(2000);

export const SellerShopStatusSchema = z.enum(["draft", "published", "blocked"]);

export const CdekCityCodeSchema = z.number().int().positive().max(2_147_483_647);
export const CdekCityNameSchema = z.string().trim().min(1).max(CDEK_CITY_NAME_MAX_LENGTH);
export const CdekShipmentPointSchema = z
  .string()
  .trim()
  .min(1)
  .max(CDEK_POINT_CODE_MAX_LENGTH)
  .regex(/^[A-Za-z0-9-]+$/, { message: "invalid_point_code" });

export const SellerShopSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().nullable(),
  cdekCityCode: CdekCityCodeSchema.nullable(),
  cdekCityName: CdekCityNameSchema.nullable(),
  cdekShipmentPoint: CdekShipmentPointSchema.nullable(),
  status: SellerShopStatusSchema,
});

export const SellerShopResponseSchema = z.object({
  shop: SellerShopSchema.nullable(),
});

export const CreateShopSchema = z.object({
  name: ShopNameSchema,
  slug: ShopSlugSchema,
  description: ShopDescriptionSchema.optional(),
});

export const UpdateShopStatusSchema = z.enum(["draft", "published"]);

export const UpdateShopSchema = z
  .object({
    name: ShopNameSchema.optional(),
    slug: ShopSlugSchema.optional(),
    description: ShopDescriptionSchema.nullable().optional(),
    cdekCityCode: CdekCityCodeSchema.nullable().optional(),
    cdekCityName: CdekCityNameSchema.nullable().optional(),
    cdekShipmentPoint: CdekShipmentPointSchema.nullable().optional(),
    status: UpdateShopStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty_update" });

export type SellerShopStatus = z.infer<typeof SellerShopStatusSchema>;
export type SellerShop = z.infer<typeof SellerShopSchema>;
export type SellerShopResponse = z.infer<typeof SellerShopResponseSchema>;
export type CreateShop = z.infer<typeof CreateShopSchema>;
export type UpdateShop = z.infer<typeof UpdateShopSchema>;
