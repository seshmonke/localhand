import { formatRubles, kopecks } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { AddToCartButton } from "../cart/AddToCartButton.js";
import { cartItemFromProduct } from "../cart/cart-item.js";
import { ScreenState } from "../components/ScreenState.js";
import { Grid, GridColumn, PageShell, Stack } from "../components/layout/index.js";
import { ApiNotFoundError } from "../lib/api.js";
import { useProductQuery } from "../lib/queries.js";

const tones = ["bg-accent-red", "bg-accent-orange", "bg-accent-green", "bg-ink"];

export function ProductPage() {
  const { t } = useTranslation();
  const { id: idParam = "" } = useParams();
  const id = Number(idParam);
  const product = useProductQuery(id);

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <PageShell className="py-10 sm:py-12">
        <ScreenState
          kind="empty"
          title={t("product.notFound.title")}
          description={t("product.invalidLink")}
          action={
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              {t("common.backToCatalog")}
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (product.isPending) {
    return (
      <PageShell className="py-10 sm:py-12">
        <Grid className="gap-y-8">
          <GridColumn span={6}>
            <div className="aspect-[4/5] border-[3px] border-ink bg-ink/10" />
          </GridColumn>
          <GridColumn span={6}>
            <Stack gap={4}>
              <div className="h-4 w-1/3 bg-ink/20" />
              <div className="h-12 w-2/3 bg-ink/20" />
              <div className="h-6 w-1/4 bg-ink/10" />
            </Stack>
          </GridColumn>
        </Grid>
      </PageShell>
    );
  }

  if (product.isError) {
    const notFound = product.error instanceof ApiNotFoundError;
    return (
      <PageShell className="py-10 sm:py-12">
        <ScreenState
          kind={notFound ? "empty" : "error"}
          title={notFound ? t("product.notFound.title") : t("product.error.title")}
          description={notFound ? t("product.notFound.description") : t("common.connectionError")}
          action={
            notFound ? (
              <Link to="/" className={buttonVariants({ variant: "outline" })}>
                {t("common.backToCatalog")}
              </Link>
            ) : (
              <Button onClick={() => void product.refetch()}>{t("common.retry")}</Button>
            )
          }
        />
      </PageShell>
    );
  }

  const item = product.data;
  const tone = tones[item.id % tones.length] ?? "bg-ink";

  return (
    <PageShell className="gap-8 py-10 sm:py-12">
      <Link
        to={`/shops/${item.shop.slug}`}
        className="inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {item.shop.name}
      </Link>

      <Grid className="gap-y-8 lg:items-start">
        <GridColumn span={6}>
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="aspect-[4/5] w-full border-[3px] border-ink object-cover"
            />
          ) : (
            <div className={`aspect-[4/5] border-[3px] border-ink ${tone}`} aria-hidden="true" />
          )}
        </GridColumn>

        <GridColumn span={6}>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red">
            {t("product.eyebrow")}
          </p>
          <h1 className="mt-4 font-display text-4xl uppercase leading-none sm:text-5xl">
            {item.name}
          </h1>
          <p className="mt-6 font-mono text-2xl">{formatRubles(kopecks(item.priceKopecks))}</p>
          {item.description ? (
            <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed">
              {item.description}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:gap-4">
            <AddToCartButton
              item={cartItemFromProduct(item)}
              size="lg"
              className="w-full sm:w-auto"
            />
            <Link
              to={`/shops/${item.shop.slug}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {t("product.toShop")}
            </Link>
          </div>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-wide">
            {t("product.deliveryNote")}
          </p>
        </GridColumn>
      </Grid>
    </PageShell>
  );
}
