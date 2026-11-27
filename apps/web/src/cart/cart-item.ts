import type { CartItem, ProductCard as ProductCardData } from "@localhand/shared";

export function cartItemFromProduct(product: ProductCardData): CartItem {
  return {
    productId: product.id,
    name: product.name,
    priceKopecks: product.priceKopecks,
    imageUrl: product.imageUrl,
    shopSlug: product.shop.slug,
    shopName: product.shop.name,
  };
}
