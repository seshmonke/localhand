import { formatRubles, kopecks, type ProductCard as ProductCardData } from "@localhand/shared";
import { Link } from "react-router";
import { AddToCartButton } from "../cart/AddToCartButton.js";
import { cartItemFromProduct } from "../cart/cart-item.js";

const tones = ["bg-accent-red", "bg-accent-orange", "bg-accent-green", "bg-ink"];

export function ProductCard({ product }: { product: ProductCardData }) {
  const tone = tones[product.id % tones.length] ?? "bg-ink";

  return (
    <Link
      to={`/products/${product.id}`}
      className="group block border-[3px] border-ink bg-paper p-2.5 shadow-brutal-sm transition-transform hover:-translate-y-0.5 sm:p-3"
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="aspect-[4/5] w-full border-[3px] border-ink object-cover"
          loading="lazy"
        />
      ) : (
        <div className={`aspect-[4/5] border-[3px] border-ink ${tone}`} aria-hidden="true" />
      )}
      <div className="mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-display text-xs uppercase leading-tight sm:text-sm">
            {product.name}
          </h3>
          <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide sm:text-[10px]">
            {product.shop.name}
          </p>
        </div>
        <p className="mt-1 font-mono text-xs sm:mt-0 sm:shrink-0 sm:text-sm">
          {formatRubles(kopecks(product.priceKopecks))}
        </p>
      </div>
      <AddToCartButton item={cartItemFromProduct(product)} size="sm" className="mt-3 h-11 w-full" />
    </Link>
  );
}
