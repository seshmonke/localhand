import { Link, Route, Routes } from "react-router";
import { Menu, Search, ShoppingBag } from "lucide-react";
import { buttonVariants } from "@localhand/ui";
import { MarketplacePage } from "./pages/MarketplacePage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ProductPage } from "./pages/ProductPage.js";
import { ShopPage } from "./pages/ShopPage.js";

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-10">
        <Link
          to="/"
          className="font-display text-lg font-extrabold uppercase leading-none tracking-tight sm:text-xl"
        >
          Local Hand
        </Link>

        <nav className="hidden items-center gap-6 font-mono text-xs uppercase tracking-wide md:flex">
          <Link className="hover:text-accent-red" to="/">
            Каталог
          </Link>
          <a className="hover:text-accent-red" href="/#how">
            Как это работает
          </a>
          <a className="hover:text-accent-red" href="/#sellers">
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
          <a href="/#sellers" className={buttonVariants({ variant: "outline", size: "sm" })}>
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
  );
}

function Footer() {
  return (
    <footer className="border-t-[3px] border-ink bg-paper">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p className="font-display text-lg font-extrabold uppercase">Local Hand</p>
        <p className="font-mono text-[10px] uppercase tracking-wide">
          Секонд-хенд · Локальные бренды · Цифровое
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wide">© 2026</p>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<MarketplacePage />} />
          <Route path="/shops/:slug" element={<ShopPage />} />
          <Route path="/products/:id" element={<ProductPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
