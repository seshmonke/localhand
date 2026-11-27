import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { ProductCard } from "../components/ProductCard.js";
import { ProductGridSkeleton, ScreenState } from "../components/ScreenState.js";
import { PageHeader, PageShell, Stack } from "../components/layout/index.js";
import { ApiNotFoundError } from "../lib/api.js";
import { useShopQuery } from "../lib/queries.js";

export function ShopPage() {
  const { slug = "" } = useParams();
  const shop = useShopQuery(slug);

  if (shop.isPending) {
    return (
      <PageShell className="py-10 sm:py-12">
        <ProductGridSkeleton />
      </PageShell>
    );
  }

  if (shop.isError) {
    const notFound = shop.error instanceof ApiNotFoundError;
    return (
      <PageShell className="py-10 sm:py-12">
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
      </PageShell>
    );
  }

  return (
    <PageShell className="gap-8 py-10 sm:py-12">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />В каталог
      </Link>

      <PageHeader
        eyebrow="Магазин"
        title={shop.data.name}
        description={shop.data.description ?? undefined}
        className="border-b-[3px]"
      />

      <section aria-labelledby="shop-products-title">
        <Stack gap={6}>
          <h2 id="shop-products-title" className="font-display text-2xl uppercase sm:text-3xl">
            Товары магазина
          </h2>

          {shop.data.products.length === 0 ? (
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
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {shop.data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </Stack>
      </section>
    </PageShell>
  );
}
