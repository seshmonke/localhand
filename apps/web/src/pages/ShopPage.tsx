import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { ProductCard } from "../components/ProductCard.js";
import { ProductGridSkeleton, ScreenState } from "../components/ScreenState.js";
import { PageHeader, PageShell, Stack } from "../components/layout/index.js";
import { ApiNotFoundError } from "../lib/api.js";
import { useShopQuery } from "../lib/queries.js";

export function ShopPage() {
  const { t } = useTranslation();
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
          title={notFound ? t("shop.notFound.title") : t("shop.error.title")}
          description={notFound ? t("shop.notFound.description") : t("common.connectionError")}
          action={
            notFound ? (
              <Link to="/" className={buttonVariants({ variant: "outline" })}>
                {t("common.backToCatalog")}
              </Link>
            ) : (
              <Button onClick={() => void shop.refetch()}>{t("common.retry")}</Button>
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
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("shop.back")}
      </Link>

      <PageHeader
        eyebrow={t("shop.eyebrow")}
        title={shop.data.name}
        description={shop.data.description ?? undefined}
        className="border-b-[3px]"
      />

      <section aria-labelledby="shop-products-title">
        <Stack gap={6}>
          <h2 id="shop-products-title" className="font-display text-2xl uppercase sm:text-3xl">
            {t("shop.productsTitle")}
          </h2>

          {shop.data.products.length === 0 ? (
            <ScreenState
              kind="empty"
              title={t("shop.empty.title")}
              description={t("shop.empty.description")}
              action={
                <Link to="/" className={buttonVariants({ variant: "outline" })}>
                  {t("shop.empty.action")}
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
