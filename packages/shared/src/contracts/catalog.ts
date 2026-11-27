import { z } from "zod";
import { ProductCardSchema } from "./storefront.js";

export const CatalogSortSchema = z.enum(["newest", "price_asc", "price_desc"]);

const CatalogSearchSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).max(100).optional(),
);

export const CatalogQuerySchema = z.object({
  q: CatalogSearchSchema,
  sort: CatalogSortSchema.default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
});

export const CatalogResponseSchema = z.object({
  products: z.array(ProductCardSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type CatalogSort = z.infer<typeof CatalogSortSchema>;
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;
