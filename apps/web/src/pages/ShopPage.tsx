import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { ProductCard } from "../components/ProductCard.js";
import { ProductGridSkeleton, ScreenState } from "../components/ScreenState.js";
import { ApiNotFoundError } from "../lib/api.js";
import { useShopQuery } from "../lib/queries.js";

export function ShopPage() {
  const { slug = "" } = useParams();
  const shop = useShopQuery(slug);

  if (shop.isPending) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        <ProductGridSkeleton />
      </div>
    );
  }

  if (shop.isError) {
    const notFound = shop.error instanceof ApiNotFoundError;
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        <ScreenState
          kind={notFound ? "empty" : "error"}
          title={notFound ? "Магазин не найден" : "Магазин не загрузился"}
          description={
            notFound
              ? "Возможно, магазин ещё не опубликован или ссылка устарела."
              : "Проверьте соединение и попробуйте снова."
          }
          action={
            notFound ? (
              <Link to="/" className={buttonVariants({ variant: "outline" })}>
                Вернуться в каталог
              </Link>
            ) : (
              <Button onClick={() => void shop.refetch()}>Повторить</Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <Link
        to="/"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />В каталог
      </Link>

      <header className="mt-8 border-b-[3px] border-ink pb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-green">
          Магазин
        </p>
        <h1 className="mt-3 font-display text-4xl uppercase leading-none sm:text-6xl">
          {shop.data.name}
        </h1>
        {shop.data.description ? (
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed">
            {shop.data.description}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="shop-products-title" className="py-8 sm:py-10">
        <h2 id="shop-products-title" className="font-display text-2xl uppercase sm:text-3xl">
          Товары магазина
        </h2>

        {shop.data.products.length === 0 ? (
          <div className="mt-6">
            <ScreenState
              kind="empty"
              title="В магазине пока нет товаров"
              description="Продавец ещё не опубликовал ни одной вещи."
              action={
                <Link to="/" className={buttonVariants({ variant: "outline" })}>
                  Смотреть другие магазины
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {shop.data.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
