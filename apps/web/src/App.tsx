import { Link, Navigate, Outlet, Route, Routes } from "react-router";
import { Menu, Search, ShoppingBag } from "lucide-react";
import { buttonVariants } from "@localhand/ui";
import { CartProvider, useCart } from "./cart/CartContext.js";
import { pluralizeItems } from "./cart/item-count.js";
import { AdminGuard } from "./components/admin/AdminGuard.js";
import { AdminShell } from "./components/admin/AdminShell.js";
import { AdminProductEditPage, AdminProductNewPage } from "./pages/AdminProductFormPage.js";
import { AdminProductsPage } from "./pages/AdminProductsPage.js";
import { AdminShopPage } from "./pages/AdminShopPage.js";
import { CartPage } from "./pages/CartPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { MarketplacePage } from "./pages/MarketplacePage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ProductPage } from "./pages/ProductPage.js";
import { ShopPage } from "./pages/ShopPage.js";

function Header() {
  const { count } = useCart();

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
          <Link className="hover:text-accent-red-text" to="/">
            Каталог
          </Link>
          <a className="hover:text-accent-red-text" href="/#how">
            Как это работает
          </a>
          <a className="hover:text-accent-red-text" href="/#sellers">
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
          <Link to="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Открыть магазин
          </Link>
          <Link
            to="/cart"
            aria-label={count > 0 ? `Корзина, ${pluralizeItems(count)}` : "Корзина"}
            className="relative inline-flex size-11 items-center justify-center border-[3px] border-ink bg-paper hover:bg-ink hover:text-paper"
          >
            <ShoppingBag aria-hidden="true" className="size-5" />
            {count > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-2 -top-2 inline-flex min-w-6 items-center justify-center border-[3px] border-ink bg-accent-orange px-1 font-mono text-[10px] font-bold leading-4 text-ink"
              >
                {count}
              </span>
            ) : null}
          </Link>
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

function StorefrontLayout() {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export function App() {
  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col bg-paper text-ink">
        <Routes>
          <Route element={<StorefrontLayout />}>
            <Route path="/" element={<MarketplacePage />} />
            <Route path="/shops/:slug" element={<ShopPage />} />
            <Route path="/products/:id" element={<ProductPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />

          <Route path="/admin" element={<AdminGuard />}>
            <Route element={<AdminShell />}>
              <Route index element={<Navigate to="shop" replace />} />
              <Route path="shop" element={<AdminShopPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="products/new" element={<AdminProductNewPage />} />
              <Route path="products/:id" element={<AdminProductEditPage />} />
              <Route path="*" element={<Navigate to="shop" replace />} />
            </Route>
          </Route>
        </Routes>
      </div>
    </CartProvider>
  );
}
