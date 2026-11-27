import { type CatalogQuery, CatalogSortSchema, type CatalogSort } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { ProductCard } from "../components/ProductCard.js";
import { ProductGridSkeleton, ScreenState } from "../components/ScreenState.js";
import { Card, PageShell, Stack } from "../components/layout/index.js";
import { useCatalogQuery } from "../lib/queries.js";

const categories = ["Винтаж", "Локальные бренды", "Цифровое", "Дом", "Аксессуары"];

const steps = [
  {
    number: "01",
    title: "Найдите вещь",
    text: "Каталог маркетплейса: поиск по названию, сортировка и страницы с товарами.",
  },
  {
    number: "02",
    title: "Купите у продавца",
    text: "Оплата на сайте, деньги уходят продавцу. Заказ и доставка видны в кабинете.",
  },
  {
    number: "03",
    title: "Получите заказ",
    text: "СДЭК или мгновенная ссылка для цифрового товара. Статус — в личном кабинете.",
  },
];

const CATALOG_PAGE_SIZE = 12;

const sortOptions: Array<{ value: CatalogSort; label: string }> = [
  { value: "newest", label: "Сначала новые" },
  { value: "price_asc", label: "Сначала дешёвые" },
  { value: "price_desc", label: "Сначала дорогие" },
];

type CatalogState = {
  q: string;
  sort: CatalogSort;
  page: number;
};

function readCatalogState(params: URLSearchParams): CatalogState {
  const rawQuery = params.get("q")?.trim() ?? "";
  const q = rawQuery.slice(0, 100);
  const rawPage = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const parsedSort = CatalogSortSchema.safeParse(params.get("sort"));

  return {
    q,
    page,
    sort: parsedSort.success ? parsedSort.data : "newest",
  };
}

export function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { q, sort, page } = readCatalogState(searchParams);
  const [searchText, setSearchText] = useState(q);
  const [syncedQuery, setSyncedQuery] = useState(q);

  if (q !== syncedQuery) {
    setSyncedQuery(q);
    setSearchText(q);
  }

  const query: CatalogQuery = {
    q: q || undefined,
    sort,
    page,
    pageSize: CATALOG_PAGE_SIZE,
  };
  const catalog = useCatalogQuery(query);
  const products = catalog.data?.products ?? [];
  const total = catalog.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const pageOutOfRange = catalog.isSuccess && products.length === 0 && total > 0;

  function applyState(next: CatalogState) {
    const params = new URLSearchParams(searchParams);
    if (next.q) {
      params.set("q", next.q);
    } else {
      params.delete("q");
    }
    if (next.sort !== "newest") {
      params.set("sort", next.sort);
    } else {
      params.delete("sort");
    }
    if (next.page > 1) {
      params.set("page", String(next.page));
    } else {
      params.delete("page");
    }
    setSearchParams(params);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyState({ q: searchText.trim().slice(0, 100), sort, page: 1 });
  }

  return (
    <>
      <section className="border-b-[3px] border-ink">
        <PageShell className="grid gap-8 py-10 sm:py-12 lg:grid-cols-12 lg:gap-x-6">
          <div className="col-span-4 flex flex-col justify-center md:col-span-8 lg:col-span-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text sm:text-xs">
              Маркетплейс нового типа
            </p>
            <h1 className="mt-4 max-w-4xl text-balance font-display text-4xl uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
              Секонд-хенд и локальные бренды в одном месте
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed sm:text-lg">
              Local Hand даёт продавцу свой магазин и общую витрину, а покупателю — один вход к
              винтажу, локальным дизайнерам и цифровым авторам.
            </p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:gap-4">
              <a href="#catalog" className={buttonVariants({ size: "lg" })}>
                Смотреть каталог
                <ArrowRight aria-hidden="true" className="size-5" />
              </a>
              <a href="#sellers" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Открыть магазин
              </a>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t-[3px] border-ink pt-4">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide">Магазины</dt>
                <dd className="mt-2 font-display text-2xl">1</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide">Товары</dt>
                <dd className="mt-2 font-display text-2xl">{catalog.data ? total : "—"}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide">Города РФ</dt>
                <dd className="mt-2 font-display text-2xl">Все</dd>
              </div>
            </dl>
          </div>

          <div className="col-span-4 hidden items-center justify-center md:col-span-8 lg:col-span-5 lg:flex">
            <div className="w-full max-w-md border-[3px] border-ink bg-inverse p-8 text-inverse-text shadow-brutal">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent-orange">
                Local Hand / v1
              </p>
              <p className="mt-8 font-display text-6xl font-extrabold uppercase leading-[0.9]">
                Вещи
                <br />
                с
                <br />
                историей
              </p>
              <div className="mt-10 grid grid-cols-2 gap-4 border-t-[3px] border-inverse-text/40 pt-4 font-mono text-[10px] uppercase tracking-wide">
                <span>Свой магазин</span>
                <span className="text-right text-accent-orange">Общая витрина</span>
                <span>Физические</span>
                <span className="text-right text-accent-green">Цифровые</span>
              </div>
            </div>
          </div>
        </PageShell>
      </section>

      <section aria-labelledby="categories-title" className="border-b-[3px] border-ink">
        <PageShell className="py-8">
          <Stack gap={4}>
            <h2 id="categories-title" className="font-mono text-xs uppercase tracking-[0.2em]">
              Категории
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {categories.map((category) => (
                <a
                  key={category}
                  href="#catalog"
                  className="inline-flex min-h-11 shrink-0 items-center border-[3px] border-ink bg-paper px-4 font-mono text-xs uppercase tracking-wide hover:bg-ink hover:text-paper"
                >
                  {category}
                </a>
              ))}
            </div>
          </Stack>
        </PageShell>
      </section>

      <section id="catalog" aria-labelledby="catalog-title" className="border-b-[3px] border-ink">
        <PageShell className="py-10 sm:py-12">
          <Stack gap={8}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
                  Каталог
                </p>
                <h2 id="catalog-title" className="mt-2 font-display text-3xl uppercase sm:text-4xl">
                  Вещи, которые стоит найти
                </h2>
              </div>
              <button
                type="button"
                onClick={() => applyState({ q: "", sort: "newest", page: 1 })}
                className="inline-flex min-h-11 items-center font-mono text-xs uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
              >
                Все товары
              </button>
            </div>

            <Card className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <search className="min-w-0">
                <form onSubmit={submitSearch}>
                  <label
                    htmlFor="catalog-search"
                    className="font-mono text-[10px] uppercase tracking-[0.2em]"
                  >
                    Поиск по каталогу
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="catalog-search"
                      type="search"
                      name="q"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      maxLength={100}
                      placeholder="Название товара или магазина"
                      className="h-12 min-w-0 flex-1 border-[3px] border-ink bg-paper px-3 font-body text-base"
                    />
                    <Button type="submit" className="shrink-0">
                      Найти
                    </Button>
                  </div>
                </form>
              </search>

              <div>
                <label
                  htmlFor="catalog-sort"
                  className="font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  Сортировка
                </label>
                <select
                  id="catalog-sort"
                  value={sort}
                  onChange={(event) => {
                    const parsedSort = CatalogSortSchema.safeParse(event.target.value);
                    applyState({
                      q,
                      sort: parsedSort.success ? parsedSort.data : "newest",
                      page: 1,
                    });
                  }}
                  className="mt-2 h-12 w-full border-[3px] border-ink bg-paper px-3 font-body text-base lg:w-56"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </Card>

            <Stack gap={4}>
              {catalog.isSuccess ? (
                <output className="block font-mono text-[10px] uppercase tracking-[0.2em]">
                  Найдено товаров: {total}
                </output>
              ) : null}

              {catalog.isPending ? <ProductGridSkeleton /> : null}

              {catalog.isError ? (
                <ScreenState
                  kind="error"
                  title="Каталог не загрузился"
                  description="Проверьте соединение и попробуйте снова."
                  action={<Button onClick={() => void catalog.refetch()}>Повторить</Button>}
                />
              ) : null}

              {catalog.isSuccess && products.length === 0 && !pageOutOfRange ? (
                <ScreenState
                  kind="empty"
                  title={q ? "Ничего не найдено" : "Пока пусто"}
                  description={
                    q
                      ? `По запросу «${q}» нет опубликованных товаров. Попробуйте другое название.`
                      : "Первые товары появятся здесь, когда продавцы опубликуют магазины."
                  }
                  action={
                    q ? (
                      <Button
                        variant="outline"
                        onClick={() => applyState({ q: "", sort, page: 1 })}
                      >
                        Сбросить поиск
                      </Button>
                    ) : undefined
                  }
                />
              ) : null}

              {pageOutOfRange ? (
                <ScreenState
                  kind="empty"
                  title="На этой странице товаров нет"
                  description={`Всего найдено товаров: ${total}. Вернитесь на первую страницу.`}
                  action={
                    <Button variant="outline" onClick={() => applyState({ q, sort, page: 1 })}>
                      На первую страницу
                    </Button>
                  }
                />
              ) : null}

              {products.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              ) : null}
            </Stack>

            {catalog.isSuccess && total > CATALOG_PAGE_SIZE && !pageOutOfRange ? (
              <nav
                aria-label="Страницы каталога"
                className="flex flex-wrap items-center justify-between gap-4 border-t-[3px] border-ink pt-4"
              >
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => applyState({ q, sort, page: page - 1 })}
                >
                  Назад
                </Button>
                <p aria-live="polite" className="font-mono text-xs uppercase tracking-wide">
                  Страница {page} из {totalPages}
                </p>
                <Button
                  variant="outline"
                  disabled={!catalog.data.hasMore}
                  onClick={() => applyState({ q, sort, page: page + 1 })}
                >
                  Дальше
                </Button>
              </nav>
            ) : null}
          </Stack>
        </PageShell>
      </section>

      <section id="how" aria-labelledby="how-title" className="border-b-[3px] border-ink">
        <PageShell className="py-10 sm:py-12">
          <Stack gap={8}>
            <h2 id="how-title" className="font-display text-3xl uppercase sm:text-4xl">
              Как это работает
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {steps.map((step) => (
                <Card key={step.number} as="article">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-orange-text">
                    {step.number}
                  </p>
                  <h3 className="mt-4 font-display text-xl uppercase">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">{step.text}</p>
                </Card>
              ))}
            </div>
          </Stack>
        </PageShell>
      </section>

      <section id="sellers" className="bg-inverse text-inverse-text">
        <PageShell className="grid gap-8 py-10 sm:py-12 lg:grid-cols-12 lg:items-center">
          <div className="col-span-4 md:col-span-8 lg:col-span-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-green">
              Продавцам
            </p>
            <h2 className="mt-4 max-w-2xl text-balance font-display text-3xl uppercase sm:text-5xl">
              <span className="block">Свой магазин.</span>
              <span className="block">Общая витрина.</span>
              <span className="block">Без комиссии с продаж.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-inverse-text/80 sm:text-base">
              <span className="block">
                Подключите ЮKassa, загрузите товары и получите ссылку на магазин.
              </span>
              <span className="block">
                Local Hand приведёт покупателей и покажет заказы в одной админке.
              </span>
            </p>
          </div>
          <div className="col-span-4 md:col-span-8 lg:col-span-4 lg:justify-self-end">
            <Button variant="accent" size="lg" className="w-full sm:w-auto" disabled>
              Скоро: стать продавцом
            </Button>
          </div>
        </PageShell>
      </section>

      <PageShell className="py-6">
        <Link
          to="/shops/local-hand-demo"
          className="inline-flex min-h-11 items-center font-mono text-xs uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
        >
          Открыть демо-магазин
        </Link>
      </PageShell>
    </>
  );
}
