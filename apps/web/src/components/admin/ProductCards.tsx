import { formatRubles, kopecks, type SellerProduct } from "@localhand/shared";
import { Link } from "react-router";
import { ProductStatusBadge } from "./ProductStatusBadge.js";

export function ProductCards({ products }: { products: SellerProduct[] }) {
  return (
    <ul className="grid gap-3 lg:hidden">
      {products.map((product) => (
        <li key={product.id} className="border-[3px] border-ink bg-paper p-4 shadow-brutal-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="min-w-0 break-words font-display text-lg uppercase leading-tight">
              {product.name}
            </h2>
            <ProductStatusBadge status={product.status} />
          </div>

          <p className="mt-2 font-mono text-sm tabular-nums">
            {formatRubles(kopecks(product.priceKopecks))}
          </p>

          {product.description ? (
            <p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-ink/70">
              {product.description}
            </p>
          ) : null}

          <Link
            to={`/admin/products/${product.id}`}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center border-[3px] border-ink px-3 font-mono text-[11px] uppercase tracking-[0.16em] hover:bg-ink hover:text-paper"
          >
            Редактировать
          </Link>
        </li>
      ))}
    </ul>
  );
}
