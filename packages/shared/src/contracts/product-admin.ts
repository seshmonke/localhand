import { z } from "zod";

/** PostgreSQL int4 upper bound: prices must never overflow the column. */
export const PRODUCT_PRICE_MAX_KOPECKS = 2_147_483_647;

export const PRODUCT_NAME_MAX_LENGTH = 120;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;
export const PRODUCT_IMAGE_URL_MAX_LENGTH = 2000;
export const PRODUCT_WEIGHT_MAX_G = 100_000;
export const PRODUCT_DIMENSION_MAX_CM = 300;

function hasNoNulByte(value: string): boolean {
  return !value.includes("\u0000");
}

const NUL_BYTE_MESSAGE = { message: "nul_byte" };

export const ProductIdSchema = z.coerce.number().int().positive().max(2_147_483_647);

export const ProductStatusSchema = z.enum(["draft", "published", "hidden"]);

export const ProductNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRODUCT_NAME_MAX_LENGTH)
  .refine(hasNoNulByte, NUL_BYTE_MESSAGE);

export const ProductDescriptionSchema = z
  .string()
  .max(PRODUCT_DESCRIPTION_MAX_LENGTH)
  .refine(hasNoNulByte, NUL_BYTE_MESSAGE);

export const ProductPriceSchema = z.number().int().min(0).max(PRODUCT_PRICE_MAX_KOPECKS);

export const ProductImageUrlSchema = z
  .string()
  .max(PRODUCT_IMAGE_URL_MAX_LENGTH)
  .refine(hasNoNulByte, NUL_BYTE_MESSAGE);

export const ProductWeightSchema = z.number().int().min(1).max(PRODUCT_WEIGHT_MAX_G);
export const ProductDimensionSchema = z.number().int().min(1).max(PRODUCT_DIMENSION_MAX_CM);

export const SellerProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(PRODUCT_NAME_MAX_LENGTH),
  description: z.string().nullable(),
  priceKopecks: z.number().int().min(0).max(PRODUCT_PRICE_MAX_KOPECKS),
  imageUrl: z.string().nullable(),
  weightG: ProductWeightSchema.nullable(),
  lengthCm: ProductDimensionSchema.nullable(),
  widthCm: ProductDimensionSchema.nullable(),
  heightCm: ProductDimensionSchema.nullable(),
  status: ProductStatusSchema,
});

export const SellerProductListResponseSchema = z.object({
  products: z.array(SellerProductSchema),
});

export const SellerProductResponseSchema = z.object({
  product: SellerProductSchema,
});

/**
 * Creates a product as a draft. Status is not part of the create contract:
 * a new product always starts in `draft`.
 */
export const CreateProductSchema = z.object({
  name: ProductNameSchema,
  description: ProductDescriptionSchema.optional(),
  priceKopecks: ProductPriceSchema,
  imageUrl: ProductImageUrlSchema.nullable().optional(),
  weightG: ProductWeightSchema.nullable().optional(),
  lengthCm: ProductDimensionSchema.nullable().optional(),
  widthCm: ProductDimensionSchema.nullable().optional(),
  heightCm: ProductDimensionSchema.nullable().optional(),
});

export const UpdateProductSchema = z
  .object({
    name: ProductNameSchema.optional(),
    description: ProductDescriptionSchema.nullable().optional(),
    priceKopecks: ProductPriceSchema.optional(),
    imageUrl: ProductImageUrlSchema.nullable().optional(),
    weightG: ProductWeightSchema.nullable().optional(),
    lengthCm: ProductDimensionSchema.nullable().optional(),
    widthCm: ProductDimensionSchema.nullable().optional(),
    heightCm: ProductDimensionSchema.nullable().optional(),
    status: ProductStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty_update" });

export type ProductStatus = z.infer<typeof ProductStatusSchema>;
export type SellerProduct = z.infer<typeof SellerProductSchema>;
export type SellerProductListResponse = z.infer<typeof SellerProductListResponseSchema>;
export type SellerProductResponse = z.infer<typeof SellerProductResponseSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
