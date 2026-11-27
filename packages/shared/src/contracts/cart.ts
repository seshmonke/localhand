import { z } from "zod";

export const CART_STORAGE_KEY = "localhand.cart.v1";
export const CART_VERSION = 1 as const;
export const CART_MAX_ITEMS = 50;

export const CartItemSchema = z.object({
  productId: z.number().int().positive(),
  name: z.string().min(1),
  priceKopecks: z.number().int().nonnegative(),
  imageUrl: z.string().nullable(),
  shopSlug: z.string().min(1),
  shopName: z.string().min(1),
});

export const CartStateSchema = z.object({
  version: z.literal(CART_VERSION),
  items: z.array(CartItemSchema).max(CART_MAX_ITEMS),
});

export type CartItem = z.infer<typeof CartItemSchema>;
export type CartState = z.infer<typeof CartStateSchema>;
