import { formatRubles, kopecks } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { ScreenState } from "../components/ScreenState.js";
import { ApiNotFoundError } from "../lib/api.js";
import { useProductQuery } from "../lib/queries.js";

const tones = ["bg-accent-red", "bg-accent-orange", "bg-accent-green", "bg-ink"];

export function ProductPage() {
  const { id: idParam = "" } = useParams();
  const id = Number(idParam);
  const product = useProductQuery(id);

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        <ScreenState
          kind="empty"
          title="Товар не найден"
          description="Ссылка на товар выглядит некорректной."
          action={
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              Вернуться в каталог
            </Link>
          }
        />
      </div>
    );
  }

  if (product.isPending) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="aspect-[4/5] border-[3px] border-ink bg-ink/10" />
          <div className="space-y-4">
            <div className="h-4 w-1/3 bg-ink/20" />
            <div className="h-12 w-2/3 bg-ink/20" />
            <div className="h-6 w-1/4 bg-ink/10" />
          </div>
        </div>
      </div>
    );
  }

  if (product.isError) {
    const notFound = product.error instanceof ApiNotFoundError;
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        <ScreenState
          kind={notFound ? "empty" : "error"}
          title={notFound ? "Товар не найден" : "Товар не загрузился"}
          description={
            notFound
              ? "Возможно, товар снят с публикации или ссылка устарела."
              : "Проверьте соединение и попробуйте снова."
          }
          action={
            notFound ? (
              <Link to="/" className={buttonVariants({ variant: "outline" })}>
                Вернуться в каталог
              </Link>
            ) : (
              <Button onClick={() => void product.refetch()}>Повторить</Button>
            )
          }
        />
      </div>
    );
  }

  const item = product.data;
  const tone = tones[item.id % tones.length] ?? "bg-ink";

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <Link
        to={`/shops/${item.shop.slug}`}
        className="inline-flex items-center gap-2 font-mono text-xs uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {item.shop.name}
      </Link>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="aspect-[4/5] w-full border-[3px] border-ink object-cover"
          />
        ) : (
          <div className={`aspect-[4/5] border-[3px] border-ink ${tone}`} aria-hidden="true" />
        )}

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red">Товар</p>
          <h1 className="mt-3 font-display text-4xl uppercase leading-none sm:text-5xl">
            {item.name}
          </h1>
          <p className="mt-5 font-mono text-2xl">{formatRubles(kopecks(item.priceKopecks))}</p>
          {item.description ? (
            <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed">
              {item.description}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" disabled>
              Корзина — скоро
            </Button>
            <Link
              to={`/shops/${item.shop.slug}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              В магазин
            </Link>
          </div>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-wide">
            Оплата и доставка появятся в следующем change.
          </p>
        </div>
      </div>
    </div>
  );
}
