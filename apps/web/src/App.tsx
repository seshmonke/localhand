import { useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@localhand/ui";
import { Menu, Search, ShoppingBag, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { CartProvider, useCart } from "./cart/CartContext.js";
import { pluralizeItems } from "./cart/item-count.js";
import { AdminGuard } from "./components/admin/AdminGuard.js";
import { AdminShell } from "./components/admin/AdminShell.js";
import { LayoutGuides, PageShell } from "./components/layout/index.js";
import { ApiError } from "./lib/api.js";
import { clearBuyerQueries, clearSellerQueries, useMeQuery } from "./lib/queries.js";
import { AdminOrderPage } from "./pages/AdminOrderPage.js";
import { AdminOrdersPage } from "./pages/AdminOrdersPage.js";
import { AdminProductEditPage, AdminProductNewPage } from "./pages/AdminProductFormPage.js";
import { AdminProductsPage } from "./pages/AdminProductsPage.js";
import { AdminShopPage } from "./pages/AdminShopPage.js";
import { CartPage } from "./pages/CartPage.js";
import { CheckoutPage } from "./pages/CheckoutPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { MarketplacePage } from "./pages/MarketplacePage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { OrderPage } from "./pages/OrderPage.js";
import { OrdersPage } from "./pages/OrdersPage.js";
import { ProductPage } from "./pages/ProductPage.js";
import { ShopPage } from "./pages/ShopPage.js";

/**
 * Fake-provider pages exist only in the dev server. The dynamic imports sit
 * behind `import.meta.env.DEV`, so a production build contains neither the
 * routes nor their chunks.
 */
const DevPaymentsConnectPage = import.meta.env.DEV
  ? lazy(() =>
      import("./pages/DevPaymentsConnectPage.js").then((module) => ({
        default: module.DevPaymentsConnectPage,
      })),
    )
  : null;
const DevPaymentCompletePage = import.meta.env.DEV
  ? lazy(() =>
      import("./pages/DevPaymentCompletePage.js").then((module) => ({
        default: module.DevPaymentCompletePage,
      })),
    )
  : null;

function DevPaymentPage({ page }: { page: NonNullable<typeof DevPaymentsConnectPage> }) {
  const Page = page;
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

function Header() {
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
      <PageShell className="h-16 flex-row items-center justify-between gap-4 sm:h-20">
        <Link
          to="/"
          className="inline-flex min-h-11 shrink-0 items-center font-display text-lg font-extrabold uppercase leading-none tracking-tight sm:text-xl"
        >
          Local Hand
        </Link>

        <nav
          data-header-nav=""
          className="hidden items-center gap-2 font-mono text-xs uppercase tracking-wide md:flex"
        >
          <Link
            className="inline-flex min-h-11 items-center px-2 hover:text-accent-red-text"
            to="/"
          >
            Каталог
          </Link>
          <a
            className="inline-flex min-h-11 items-center px-2 hover:text-accent-red-text"
            href="/#how"
          >
            Как это работает
          </a>
          <a
            className="inline-flex min-h-11 items-center px-2 hover:text-accent-red-text"
            href="/#sellers"
          >
            Продавцам
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Поиск"
            data-header-control=""
            className="hidden size-11 shrink-0 items-center justify-center border-[3px] border-ink bg-paper hover:bg-ink hover:text-paper sm:inline-flex"
          >
            <Search aria-hidden="true" className="size-5" />
          </button>
          <span className="hidden shrink-0 lg:inline-flex">
            <Link
              to="/login"
              data-header-control=""
              data-header-cta=""
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "h-11",
              })}
            >
              Открыть магазин
            </Link>
          </span>
          <Link
            to="/cart"
            aria-label={count > 0 ? `Корзина, ${pluralizeItems(count)}` : "Корзина"}
            data-header-control=""
            className="relative inline-flex size-11 shrink-0 items-center justify-center border-[3px] border-ink bg-paper hover:bg-ink hover:text-paper"
          >
            <ShoppingBag aria-hidden="true" className="size-5" />
            {count > 0 ? (
              <span
                aria-hidden="true"
                data-cart-badge=""
                className="absolute -right-1 -top-1 inline-flex min-w-6 items-center justify-center border-[3px] border-ink bg-accent-orange px-1 font-mono text-[10px] font-bold leading-4 text-ink"
              >
                {count}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            aria-label="Меню"
            data-header-control=""
            className="inline-flex size-11 shrink-0 items-center justify-center border-[3px] border-ink bg-paper md:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
        </div>
      </PageShell>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t-[3px] border-ink bg-paper">
      <PageShell className="flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-lg font-extrabold uppercase">Local Hand</p>
        <p className="font-mono text-[10px] uppercase tracking-wide">
          Секонд-хенд · Локальные бренды · Цифровое
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wide">© 2026</p>
      </PageShell>
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

function BuyerGuardFrame({ children }: { children: ReactNode }) {
  return (
    <PageShell className="min-h-[60vh] items-center justify-center py-12">
      <div className="w-full max-w-md border-[3px] border-ink bg-paper p-6 shadow-brutal-sm sm:p-8">
        {children}
      </div>
    </PageShell>
  );
}

function ExpiredSessionRedirect({ next }: { next: string }) {
  const queryClient = useQueryClient();
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([clearSellerQueries(queryClient), clearBuyerQueries(queryClient)]).finally(
      () => {
        if (active) {
          setCleared(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [queryClient]);

  if (!cleared) {
    return (
      <BuyerGuardFrame>
        <output aria-live="polite" className="block font-mono text-xs uppercase tracking-[0.2em]">
          Проверяем сессию…
        </output>
      </BuyerGuardFrame>
    );
  }

  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
}

/**
 * Auth gate for buyer screens. A 401 sends the visitor to login with the
 * current internal path as `next`; the cached seller and buyer data is dropped
 * first so neither PII nor a stale session can leak into the next login.
 */
function BuyerGuard() {
  const me = useMeQuery();
  const location = useLocation();

  if (me.isPending) {
    return (
      <BuyerGuardFrame>
        <output aria-live="polite" className="block font-mono text-xs uppercase tracking-[0.2em]">
          Проверяем сессию…
        </output>
      </BuyerGuardFrame>
    );
  }

  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      const next = `${location.pathname}${location.search}${location.hash}`;
      return <ExpiredSessionRedirect next={next} />;
    }

    return (
      <BuyerGuardFrame>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-red-text">
          Ошибка
        </p>
        <h1 className="mt-2 font-display text-2xl uppercase leading-tight">
          Не удалось проверить сессию
        </h1>
        <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-red" />
          Проверьте соединение и попробуйте снова.
        </p>
        <Button className="mt-6" onClick={() => void me.refetch()}>
          Повторить
        </Button>
      </BuyerGuardFrame>
    );
  }

  return <Outlet />;
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
            <Route element={<BuyerGuard />}>
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />

          {DevPaymentsConnectPage ? (
            <Route
              path="/dev/payments/connect"
              element={<DevPaymentPage page={DevPaymentsConnectPage} />}
            />
          ) : null}
          {DevPaymentCompletePage ? (
            <Route
              path="/dev/payments/:id/complete"
              element={<DevPaymentPage page={DevPaymentCompletePage} />}
            />
          ) : null}

          <Route path="/admin" element={<AdminGuard />}>
            <Route element={<AdminShell />}>
              <Route index element={<Navigate to="shop" replace />} />
              <Route path="shop" element={<AdminShopPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="products/new" element={<AdminProductNewPage />} />
              <Route path="products/:id" element={<AdminProductEditPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="orders/:id" element={<AdminOrderPage />} />
              <Route path="*" element={<Navigate to="shop" replace />} />
            </Route>
          </Route>
        </Routes>
        <LayoutGuides />
      </div>
    </CartProvider>
  );
}
