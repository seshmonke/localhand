import { formatRubles, kopecks, type SellerProduct } from "@localhand/shared";
import { Link } from "react-router";
import { ProductStatusBadge } from "./ProductStatusBadge.js";

export function ProductTable({ products }: { products: SellerProduct[] }) {
  return (
    <div className="hidden lg:block">
      <table className="w-full table-fixed border-collapse border-[3px] border-ink bg-paper">
        <caption className="sr-only">Товары вашего магазина</caption>
        <thead className="sticky top-0 z-10 bg-paper">
          <tr className="border-b-[3px] border-ink text-left font-mono text-[10px] uppercase tracking-[0.18em]">
            <th scope="col" className="w-[40%] px-3 py-3 xl:px-4">
              Название
            </th>
            <th scope="col" className="w-[20%] px-3 py-3 xl:px-4">
              Цена
            </th>
            <th scope="col" className="w-[22%] px-3 py-3 xl:px-4">
              Статус
            </th>
            <th scope="col" className="w-[18%] px-3 py-3 xl:px-4">
              Действия
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-b-[3px] border-ink align-top last:border-b-0">
              <th scope="row" className="px-3 py-4 text-left font-normal xl:px-4">
                <span className="block break-words font-semibold leading-snug">{product.name}</span>
                {product.description ? (
                  <span className="mt-1 line-clamp-2 block break-words text-sm leading-relaxed text-ink/60">
                    {product.description}
                  </span>
                ) : null}
              </th>
              <td className="break-words px-3 py-4 font-mono text-xs tabular-nums xl:px-4 xl:text-sm">
                {formatRubles(kopecks(product.priceKopecks))}
              </td>
              <td className="px-3 py-4 xl:px-4">
                <ProductStatusBadge status={product.status} />
              </td>
              <td className="px-3 py-4 xl:px-4">
                <Link
                  to={`/admin/products/${product.id}`}
                  className="inline-flex min-h-11 items-center border-[3px] border-ink px-2 font-mono text-[10px] uppercase tracking-[0.1em] whitespace-nowrap hover:bg-ink hover:text-paper xl:px-3 xl:tracking-[0.16em]"
                >
                  Изменить
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
