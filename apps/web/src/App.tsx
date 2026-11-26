import { ArrowRight, Menu, Search, ShoppingBag } from "lucide-react";
import { Button, buttonVariants } from "@localhand/ui";

const categories = ["Винтаж", "Локальные бренды", "Цифровое", "Дом", "Аксессуары"];

const products = [
  {
    name: "Куртка 90-х",
    shop: "Винтаж на районе",
    price: "4 200 ₽",
    tone: "bg-accent-red",
  },
  {
    name: "Свитер ручной вязки",
    shop: "Мастерская «Нить»",
    price: "6 800 ₽",
    tone: "bg-accent-orange",
  },
  {
    name: "Сумка из остатков кожи",
    shop: "Local Leather",
    price: "9 500 ₽",
    tone: "bg-accent-green",
  },
  {
    name: "Цифровой зин",
    shop: "Печать и шум",
    price: "490 ₽",
    tone: "bg-ink",
  },
];

const steps = [
  {
    number: "01",
    title: "Найдите вещь",
    text: "Каталог маркетплейса: фильтры по категории, цене, состоянию и магазину.",
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

export function App() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-10">
          <a
            href="/"
            className="font-display text-lg uppercase leading-none tracking-tight sm:text-xl"
          >
            Local Hand
          </a>

          <nav className="hidden items-center gap-6 font-mono text-xs uppercase tracking-wide md:flex">
            <a className="hover:text-accent-red" href="#catalog">
              Каталог
            </a>
            <a className="hover:text-accent-red" href="#how">
              Как это работает
            </a>
            <a className="hover:text-accent-red" href="#sellers">
              Продавцам
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Поиск"
              className="hidden size-11 items-center justify-center border-[3px] border-ink bg-paper hover:bg-ink hover:text-paper sm:inline-flex"
            >
              <Search aria-hidden="true" className="size-5" />
            </button>
            <a href="#sellers" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Открыть магазин
            </a>
            <button
              type="button"
              aria-label="Корзина"
              className="inline-flex size-11 items-center justify-center border-[3px] border-ink bg-paper hover:bg-ink hover:text-paper"
            >
              <ShoppingBag aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Меню"
              className="inline-flex size-11 items-center justify-center border-[3px] border-ink bg-paper md:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b-[3px] border-ink">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-20">
            <div className="flex flex-col justify-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red sm:text-xs">
                Маркетплейс нового типа
              </p>
              <h1 className="mt-4 max-w-4xl text-balance font-display text-4xl uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
                Секонд-хенд и локальные бренды в одном месте
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed sm:text-lg">
                Local Hand даёт продавцу свой магазин и общую витрину, а покупателю — один вход к
                винтажу, локальным дизайнерам и цифровым авторам.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#catalog" className={buttonVariants({ size: "lg" })}>
                  Смотреть каталог
                  <ArrowRight aria-hidden="true" className="size-5" />
                </a>
                <a href="#sellers" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Открыть магазин
                </a>
              </div>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t-[3px] border-ink pt-5">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wide">Магазины</dt>
                  <dd className="mt-1 font-display text-2xl">30+</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wide">Товары</dt>
                  <dd className="mt-1 font-display text-2xl">300+</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wide">Города РФ</dt>
                  <dd className="mt-1 font-display text-2xl">Все</dd>
                </div>
              </dl>
            </div>

            <div className="hidden items-center justify-center lg:flex">
              <div className="w-full max-w-md border-[3px] border-ink bg-ink p-8 text-paper shadow-brutal">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent-orange">
                  Local Hand / v1
                </p>
                <p className="mt-8 font-display text-6xl uppercase leading-[0.9]">
                  Вещи
                  <br />
                  с
                  <br />
                  историей
                </p>
                <div className="mt-10 grid grid-cols-2 gap-3 border-t-[3px] border-paper/40 pt-5 font-mono text-[10px] uppercase tracking-wide">
                  <span>Свой магазин</span>
                  <span className="text-right text-accent-orange">Общая витрина</span>
                  <span>Физические</span>
                  <span className="text-right text-accent-green">Цифровые</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="categories-title" className="border-b-[3px] border-ink">
          <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10">
            <h2 id="categories-title" className="font-mono text-xs uppercase tracking-[0.2em]">
              Категории
            </h2>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {categories.map((category) => (
                <a
                  key={category}
                  href="#catalog"
                  className="shrink-0 border-[3px] border-ink bg-paper px-4 py-2 font-mono text-xs uppercase tracking-wide hover:bg-ink hover:text-paper"
                >
                  {category}
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="catalog" aria-labelledby="catalog-title" className="border-b-[3px] border-ink">
          <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red">
                  Каталог
                </p>
                <h2 id="catalog-title" className="mt-2 font-display text-3xl uppercase sm:text-4xl">
                  Вещи, которые стоит найти
                </h2>
              </div>
              <a
                href="#catalog"
                className="font-mono text-xs uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red"
              >
                Все товары
              </a>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {products.map((product) => (
                <article
                  key={product.name}
                  className="border-[3px] border-ink bg-paper p-2.5 shadow-brutal-sm sm:p-3"
                >
                  <div
                    className={`aspect-[4/5] border-[3px] border-ink ${product.tone}`}
                    aria-hidden="true"
                  />
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-xs uppercase leading-tight sm:text-sm">
                        {product.name}
                      </h3>
                      <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide sm:text-[10px]">
                        {product.shop}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-xs sm:text-sm">{product.price}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="border-b-[3px] border-ink">
          <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
            <h2 id="how-title" className="font-display text-3xl uppercase sm:text-4xl">
              Как это работает
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {steps.map((step) => (
                <article key={step.number} className="border-[3px] border-ink bg-paper p-5">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-orange">
                    {step.number}
                  </p>
                  <h3 className="mt-4 font-display text-xl uppercase">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="sellers" className="bg-ink text-paper">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-green">
                Продавцам
              </p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl uppercase sm:text-5xl">
                Свой магазин. Общая витрина. Без комиссии с продаж.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/80 sm:text-base">
                Подключите ЮKassa, загрузите товары и получите ссылку на магазин. Local Hand
                приведёт покупателей и покажет заказы в одной админке.
              </p>
            </div>
            <Button variant="accent" size="lg" className="w-full sm:w-auto">
              Стать продавцом
              <ArrowRight aria-hidden="true" className="size-5" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t-[3px] border-ink bg-paper">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p className="font-display text-lg uppercase">Local Hand</p>
          <p className="font-mono text-[10px] uppercase tracking-wide">
            Секонд-хенд · Локальные бренды · Цифровое
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wide">© 2026</p>
        </div>
      </footer>
    </div>
  );
}
