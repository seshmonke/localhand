import {
  formatRubles,
  kopecks,
  type OrderItem,
  type OrderStatus,
  type OrderSummary,
} from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { Link, useLocation } from "react-router";
import { Announcer } from "../components/FormField.js";
import { ScreenState } from "../components/ScreenState.js";
import { SessionExpiredState } from "../components/admin/SessionExpiredState.js";
import { ApiError } from "../lib/api.js";
import { useMyOrdersQuery } from "../lib/queries.js";
import { pluralizeItems } from "../cart/item-count.js";

const statusLabels: Record<OrderStatus, string> = {
  new: "Новый",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});

export function formatOrderDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function formatOrderPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) {
    return phone;
  }
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className="inline-flex min-h-9 shrink-0 items-center gap-2 border-[3px] border-ink bg-paper px-3 font-mono text-[10px] uppercase tracking-[0.18em]">
      <span aria-hidden="true" className="size-2.5 bg-accent-green" />
      {statusLabels[status]}
    </span>
  );
}

export function OrderItemsList({
  items,
  links = true,
  label = "Состав заказа",
}: {
  items: OrderItem[];
  links?: boolean;
  label?: string;
}) {
  return (
    <ul aria-label={label} className="mt-2 space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item.productId ?? "deleted"}-${index}`}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-[3px] border-ink/15 pt-2 first:border-t-0 first:pt-0"
        >
          {links && item.productId !== null ? (
            <Link
              to={`/products/${item.productId}`}
              className="min-w-0 break-words font-semibold leading-snug underline-offset-4 hover:underline"
            >
              {item.name}
            </Link>
          ) : (
            <span className="min-w-0 break-words font-semibold leading-snug">{item.name}</span>
          )}
          <span className="font-mono text-xs tabular-nums sm:text-sm">
            {formatRubles(kopecks(item.priceKopecks))}
          </span>
        </li>
      ))}
    </ul>
  );
}

type OrdersLocationState = {
  checkoutDone?: boolean;
};

export function OrdersPage() {
  const ordersQuery = useMyOrdersQuery();
  const location = useLocation();
  const state = location.state as OrdersLocationState | null;
  const checkoutDone = state?.checkoutDone === true;
  const orders = ordersQuery.data?.orders ?? [];

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
          Local Hand
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">
          Мои заказы
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed">
          Заказы, оформленные с вашего номера. Продавец свяжется по указанному телефону.
        </p>
      </header>

      <div className="mt-4">
        <Announcer message={checkoutDone ? "Заказ оформлен и передан продавцу." : ""} />
      </div>

      <div className="mt-6">
        {ordersQuery.isPending ? (
          <ScreenState
            kind="loading"
            title="Загружаем заказы"
            description="Секунду — собираем ваши заявки."
          />
        ) : null}

        {ordersQuery.isError ? (
          <OrdersLoadError error={ordersQuery.error} onRetry={() => void ordersQuery.refetch()} />
        ) : null}

        {ordersQuery.isSuccess && orders.length === 0 ? (
          <ScreenState
            kind="empty"
            title="Заказов пока нет"
            description="Добавьте товары в корзину и оформите первый заказ — он появится здесь."
            action={
              <Link to="/" className={buttonVariants({ variant: "outline" })}>
                Перейти в каталог
              </Link>
            }
          />
        ) : null}

        {ordersQuery.isSuccess && orders.length > 0 ? (
          <ul className="space-y-4">
            {orders.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  const headingId = `order-card-${order.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="border-[3px] border-ink bg-paper shadow-brutal-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-ink p-4">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-xl uppercase">
            Заказ №{order.id}
          </h2>
          <time
            dateTime={order.createdAt}
            className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-ink/60"
          >
            {formatOrderDate(order.createdAt)}
          </time>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="text-sm leading-relaxed">
            Магазин:{" "}
            <Link
              to={`/shops/${order.shop.slug}`}
              className="break-words font-semibold underline-offset-4 hover:underline"
            >
              {order.shop.name}
            </Link>
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink/60">
            {pluralizeItems(order.items.length)}
          </p>
          <OrderItemsList items={order.items} label={`Состав заказа №${order.id}`} />
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="font-mono text-base font-semibold tabular-nums">
            {formatRubles(kopecks(order.totalKopecks))}
          </p>
          <Link
            to={`/orders/${order.id}`}
            className={buttonVariants({ variant: "outline", size: "md" })}
          >
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  );
}

function OrdersLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 401) {
    return <SessionExpiredState next="/orders" />;
  }

  return (
    <ScreenState
      kind="error"
      title="Заказы не загрузились"
      description="Проверьте соединение и попробуйте снова."
      action={<Button onClick={onRetry}>Повторить</Button>}
    />
  );
}
