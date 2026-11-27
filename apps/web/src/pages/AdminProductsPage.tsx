import { Button, buttonVariants } from "@localhand/ui";
import { Link, useLocation } from "react-router";
import { Announcer } from "../components/FormField.js";
import { ProductCards } from "../components/admin/ProductCards.js";
import { ProductTable } from "../components/admin/ProductTable.js";
import { SessionExpiredState } from "../components/admin/SessionExpiredState.js";
import { ScreenState } from "../components/ScreenState.js";
import { ApiError } from "../lib/api.js";
import { useSellerProductsQuery, useSellerShopQuery } from "../lib/queries.js";

type ProductsLocationState = {
  createdProduct?: string;
};

export function AdminProductsPage() {
  const shopQuery = useSellerShopQuery();
  const shop = shopQuery.data?.shop ?? null;
  const productsQuery = useSellerProductsQuery(shop !== null);
  const location = useLocation();
  const state = location.state as ProductsLocationState | null;
  const createdProduct = typeof state?.createdProduct === "string" ? state.createdProduct : null;
  const products = productsQuery.data?.products ?? [];

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
          Кабинет продавца
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl uppercase leading-none sm:text-4xl">Товары</h1>
          {shop ? (
            <Link
              to="/admin/products/new"
              className={buttonVariants({ size: "md", className: "w-full sm:w-auto" })}
            >
              Новый товар
            </Link>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed">
          {shop
            ? "Все товары магазина: черновики, опубликованные и скрытые. Создайте карточку и управляйте публикацией."
            : "Товары живут внутри магазина. Сначала настройте магазин — потом добавляйте товары."}
        </p>
      </header>

      <div className="mt-4">
        <Announcer
          message={createdProduct ? `Товар «${createdProduct}» создан как черновик.` : ""}
        />
      </div>

      <div className="mt-6">
        {shopQuery.isPending ? (
          <ScreenState
            kind="loading"
            title="Загружаем товары"
            description="Секунду — проверяем магазин и карточки."
          />
        ) : null}

        {shopQuery.isError ? (
          <ProductsLoadError
            error={shopQuery.error}
            onRetry={() => void shopQuery.refetch()}
            next="/admin/products"
          />
        ) : null}

        {shopQuery.isSuccess && !shop ? (
          <ScreenState
            kind="empty"
            title="Сначала создайте магазин"
            description="Товары публикуются внутри магазина. Настройте магазин, а затем добавьте первую карточку."
            action={
              <Link to="/admin/shop" className={buttonVariants({ variant: "outline" })}>
                Настроить магазин
              </Link>
            }
          />
        ) : null}

        {shop ? (
          <>
            {productsQuery.isPending ? (
              <ScreenState
                kind="loading"
                title="Загружаем товары"
                description="Секунду — собираем карточки магазина."
              />
            ) : null}

            {productsQuery.isError ? (
              <ProductsLoadError
                error={productsQuery.error}
                onRetry={() => void productsQuery.refetch()}
                next="/admin/products"
              />
            ) : null}

            {productsQuery.isSuccess && products.length === 0 ? (
              <ScreenState
                kind="empty"
                title="Товаров пока нет"
                description="Создайте первую карточку. Она сохранится черновиком — опубликовать её можно после публикации магазина."
                action={
                  <Link to="/admin/products/new" className={buttonVariants()}>
                    Новый товар
                  </Link>
                }
              />
            ) : null}

            {productsQuery.isSuccess && products.length > 0 ? (
              <>
                <ProductTable products={products} />
                <ProductCards products={products} />
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProductsLoadError({
  error,
  onRetry,
  next,
}: {
  error: unknown;
  onRetry: () => void;
  next: string;
}) {
  if (error instanceof ApiError && error.status === 401) {
    return <SessionExpiredState next={next} />;
  }

  return (
    <ScreenState
      kind="error"
      title="Товары не загрузились"
      description="Проверьте соединение и попробуйте снова."
      action={<Button onClick={onRetry}>Повторить</Button>}
    />
  );
}
