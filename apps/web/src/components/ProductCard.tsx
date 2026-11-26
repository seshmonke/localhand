import { formatRubles, kopecks, type ProductCard as ProductCardData } from "@localhand/shared";
import { Link } from "react-router";

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
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-xs uppercase leading-tight sm:text-sm">
            {product.name}
          </h3>
          <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide sm:text-[10px]">
            {product.shop.name}
          </p>
        </div>
        <p className="shrink-0 font-mono text-xs sm:text-sm">
          {formatRubles(kopecks(product.priceKopecks))}
        </p>
      </div>
    </Link>
  );
}
