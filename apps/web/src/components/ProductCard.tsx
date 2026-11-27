import { formatRubles, kopecks, type ProductCard as ProductCardData } from "@localhand/shared";
import { Link } from "react-router";
import { AddToCartButton } from "../cart/AddToCartButton.js";
import { cartItemFromProduct } from "../cart/cart-item.js";

const tones = ["bg-accent-red", "bg-accent-orange", "bg-accent-green", "bg-ink"];

export function ProductCard({ product }: { product: ProductCardData }) {
  const tone = tones[product.id % tones.length] ?? "bg-ink";

  return (
    <article className="flex h-full flex-col border-[3px] border-ink bg-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-red-text">
      <Link
        to={`/products/${product.id}`}
        className="group/link flex grow flex-col focus-visible:outline-none"
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="aspect-[4/5] w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={`aspect-[4/5] w-full ${tone}`} aria-hidden="true" />
        )}
        <div className="flex flex-col gap-1.5 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h3 className="break-words font-display text-xs uppercase leading-tight group-hover/link:underline group-hover/link:decoration-[3px] group-hover/link:underline-offset-2 sm:text-sm">
              {product.name}
            </h3>
            <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide sm:text-[10px]">
              {product.shop.name}
            </p>
          </div>
          <p className="font-mono text-xs sm:mt-0 sm:shrink-0 sm:text-sm">
            {formatRubles(kopecks(product.priceKopecks))}
          </p>
        </div>
      </Link>
      <div className="px-4 pb-4 pt-4">
        <AddToCartButton
          item={cartItemFromProduct(product)}
          size="sm"
          className="h-11 w-full whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm"
        />
      </div>
    </article>
  );
}
