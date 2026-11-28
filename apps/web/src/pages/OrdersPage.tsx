import {
  formatRubles,
  kopecks,
  ORDER_STATUS_LABELS,
  type OrderItem,
  type OrderStatus,
  type OrderSummary,
} from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Announcer } from "../components/FormField.js";
import { DeliveryListLine } from "../components/orders/DeliverySummaryCard.js";
import { ScreenState } from "../components/ScreenState.js";
import { PaymentReadStatus, type PaymentRead } from "../components/admin/payment-read.js";
import { SessionExpiredState } from "../components/admin/SessionExpiredState.js";
import { PageHeader, PageShell, Stack } from "../components/layout/index.js";
import { ApiError, fetchOrderPayment } from "../lib/api.js";
import { orderKeys, useMyOrdersQuery } from "../lib/queries.js";
import { pluralizeItems } from "../cart/item-count.js";

const statusLabels: Record<OrderStatus, string> = ORDER_STATUS_LABELS;

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
  label,
}: {
  items: OrderItem[];
  links?: boolean;
  label: string;
}) {
  return (
    <ul aria-label={label} className="mt-2 flex flex-col gap-2">
      {items.map((item, index) => (
        <li
          key={`${item.productId ?? "deleted"}-${index}`}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t-[3px] border-ink/15 pt-2 first:border-t-0 first:pt-0"
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
  const { t } = useTranslation();
  const ordersQuery = useMyOrdersQuery();
  const location = useLocation();
  const state = location.state as OrdersLocationState | null;
  const checkoutDone = state?.checkoutDone === true;
  const orders = ordersQuery.data?.orders ?? [];

  return (
    <PageShell className="py-10 sm:py-12">
      <Stack gap={6}>
        <PageHeader
          eyebrow="Local Hand"
          title={t("orders.title")}
          description={t("orders.description")}
        />

        <Announcer message={checkoutDone ? t("orders.announcer.checkoutDone") : ""} />

        <div>
          {ordersQuery.isPending ? (
            <ScreenState
              kind="loading"
              title={t("orders.loading.title")}
              description={t("orders.loading.description")}
            />
          ) : null}

          {ordersQuery.isError ? (
            <OrdersLoadError error={ordersQuery.error} onRetry={() => void ordersQuery.refetch()} />
          ) : null}

          {ordersQuery.isSuccess && orders.length === 0 ? (
            <ScreenState
              kind="empty"
              title={t("orders.empty.title")}
              description={t("orders.empty.description")}
              action={
                <Link to="/" className={buttonVariants({ variant: "outline" })}>
                  {t("orders.empty.action")}
                </Link>
              }
            />
          ) : null}

          {ordersQuery.isSuccess && orders.length > 0 ? <OrdersList orders={orders} /> : null}
        </div>
      </Stack>
    </PageShell>
  );
}

/**
 * Loads the payment status for each visible order. There is no pagination yet,
 * so one read per order is bounded by the list size; the keys match the order
 * detail page, so opening an order reuses the cached read.
 */
function OrdersList({ orders }: { orders: OrderSummary[] }) {
  const payments = useQueries({
    queries: orders.map((order) => ({
      queryKey: orderKeys.payment(order.id),
      queryFn: () => fetchOrderPayment(order.id),
      retry: false,
      staleTime: 15_000,
    })),
  });

  const reads: PaymentRead[] = orders.map((order, index) => {
    const query = payments[index];
    if (!query || query.isPending) {
      return { kind: "loading" };
    }
    if (query.isError) {
      return { kind: "error", retry: () => void query.refetch() };
    }
    return { kind: "ready", payment: query.data?.payment ?? null };
  });

  return (
    <ul className="flex flex-col gap-4">
      {orders.map((order, index) => (
        <li key={order.id}>
          <OrderCard order={order} read={reads[index] ?? { kind: "loading" }} />
        </li>
      ))}
    </ul>
  );
}

function OrderCard({ order, read }: { order: OrderSummary; read: PaymentRead }) {
  const { t } = useTranslation();
  const headingId = `order-card-${order.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="border-[3px] border-ink bg-paper shadow-brutal-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-ink p-4">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-xl uppercase">
            {t("order.title", { id: order.id })}
          </h2>
          <time
            dateTime={order.createdAt}
            className="mt-2 block font-mono text-[10px] uppercase tracking-wide text-ink/60"
          >
            {formatOrderDate(order.createdAt)}
          </time>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="text-sm leading-relaxed">
            {t("order.shopPrefix")}{" "}
            <Link
              to={`/shops/${order.shop.slug}`}
              className="break-words font-semibold underline-offset-4 hover:underline"
            >
              {order.shop.name}
            </Link>
          </p>
          <div
            className="mt-3 flex flex-wrap items-center gap-2"
            aria-label={t("orders.payment.label")}
          >
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
              {t("order.payment.title")}
            </span>
            <PaymentReadStatus
              orderStatus={order.status}
              read={read}
              emptyLabel={t("orders.payment.empty")}
            />
          </div>
          {order.delivery !== null ? <DeliveryListLine delivery={order.delivery} /> : null}
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink/60">
            {pluralizeItems(order.items.length)}
          </p>
          <OrderItemsList items={order.items} label={t("order.items.label", { id: order.id })} />
        </div>

        <div className="flex flex-col items-start gap-4 sm:items-end">
          <p className="font-mono text-base font-semibold tabular-nums">
            {formatRubles(kopecks(order.totalKopecks))}
          </p>
          <Link
            to={`/orders/${order.id}`}
            className={buttonVariants({ variant: "outline", size: "md" })}
          >
            {t("orders.details")}
          </Link>
        </div>
      </div>
    </article>
  );
}

function OrdersLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  if (error instanceof ApiError && error.status === 401) {
    return <SessionExpiredState next="/orders" />;
  }

  return (
    <ScreenState
      kind="error"
      title={t("orders.error.title")}
      description={t("order.error.description")}
      action={<Button onClick={onRetry}>{t("common.retry")}</Button>}
    />
  );
}
