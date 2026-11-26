import { z } from "zod";

export const ShopSummarySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const ProductCardSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  priceKopecks: z.number().int().nonnegative(),
  imageUrl: z.string().nullable(),
  shop: ShopSummarySchema,
});

export const ProductListResponseSchema = z.object({
  products: z.array(ProductCardSchema),
});

export const ShopPageSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  products: z.array(ProductCardSchema),
});

export const ProductDetailSchema = ProductCardSchema.extend({
  description: z.string().nullable(),
});

export const ApiErrorSchema = z.object({
  error: z.string(),
});

export type ShopSummary = z.infer<typeof ShopSummarySchema>;
export type ProductCard = z.infer<typeof ProductCardSchema>;
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;
export type ShopPage = z.infer<typeof ShopPageSchema>;
export type ProductDetail = z.infer<typeof ProductDetailSchema>;
