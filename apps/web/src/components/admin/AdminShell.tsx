import { Button, cn } from "@localhand/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, LogOut, Package, Store } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { ApiError, logout } from "../../lib/api.js";
import { authKeys, clearSellerQueries, useMeQuery } from "../../lib/queries.js";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) {
    return phone;
  }
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function AdminNavLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "inline-flex min-h-11 shrink-0 items-center gap-2 border-[3px] px-3 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors",
          isActive
            ? "border-ink bg-ink text-paper"
            : "border-transparent hover:border-ink hover:bg-paper",
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

export function AdminShell() {
  const me = useMeQuery();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function finishLogout() {
    try {
      await clearSellerQueries(queryClient);
    } finally {
      queryClient.removeQueries({ queryKey: authKeys.me });
      navigate("/login", { replace: true });
    }
  }

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: finishLogout,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        void finishLogout();
      }
    },
  });

  const logoutFailed = logoutMutation.isError;

  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border-[3px] focus:border-ink focus:bg-paper focus:px-4 focus:py-3 focus:font-mono focus:text-xs focus:uppercase focus:tracking-wide"
      >
        К содержимому
      </a>

      <aside className="border-b-[3px] border-ink bg-paper lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r-[3px]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-5 lg:py-6">
          <Link to="/" className="flex min-h-11 flex-col justify-center">
            <span className="font-display text-lg font-extrabold uppercase leading-none tracking-tight">
              Local Hand
            </span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-accent-green-text">
              Кабинет продавца
            </span>
          </Link>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {logoutMutation.isPending ? "Выходим…" : "Выйти"}
          </Button>
        </div>

        <nav
          aria-label="Разделы админки"
          className="flex flex-wrap gap-2 px-4 pb-3 sm:px-6 lg:flex-col lg:flex-nowrap lg:px-5 lg:pb-0"
        >
          <AdminNavLink to="/admin/shop" icon={<Store aria-hidden="true" className="size-4" />}>
            Магазин
          </AdminNavLink>
          <AdminNavLink
            to="/admin/products"
            icon={<Package aria-hidden="true" className="size-4" />}
          >
            Товары
          </AdminNavLink>
          <AdminNavLink
            to="/admin/orders"
            icon={<ClipboardList aria-hidden="true" className="size-4" />}
          >
            Заказы
          </AdminNavLink>
        </nav>

        {logoutFailed ? (
          <p role="alert" className="px-4 pb-3 text-sm font-semibold sm:px-6 lg:px-5">
            Не удалось выйти. Попробуйте снова.
          </p>
        ) : null}

        <div className="mt-auto hidden border-t-[3px] border-ink px-5 py-5 lg:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60">
            Вы вошли как
          </p>
          <p className="mt-1 font-mono text-xs">
            {me.data ? formatPhone(me.data.user.phone) : "—"}
          </p>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <main
          id="admin-main"
          tabIndex={-1}
          className="flex-1 px-4 py-6 focus-visible:outline-none sm:px-6 lg:px-10 lg:py-10"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
