import { formatRubles, kopecks, type OrderSummary } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { Link } from "react-router";
import { pluralizeItems } from "../cart/item-count.js";
import { ScreenState } from "../components/ScreenState.js";
import { SessionExpiredState } from "../components/admin/SessionExpiredState.js";
import { ApiError } from "../lib/api.js";
import { useSellerOrdersQuery, useSellerShopQuery } from "../lib/queries.js";
import { formatOrderDate, formatOrderPhone, OrderStatusBadge } from "./OrdersPage.js";

export function AdminOrdersPage() {
  const shopQuery = useSellerShopQuery();
  const shop = shopQuery.data?.shop ?? null;
  const ordersQuery = useSellerOrdersQuery(shop !== null);
  const orders = ordersQuery.data?.orders ?? [];

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
          Кабинет продавца
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase leading-none sm:text-4xl">Заказы</h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed">
          {shop
            ? "Заявки покупателей вашего магазина, новые первыми. Оплата и доставка не подключены."
            : "Заказы приходят в магазин. Сначала настройте магазин — потом принимайте заказы."}
        </p>
      </header>

      <div className="mt-6">
        {shopQuery.isPending ? (
          <ScreenState
            kind="loading"
            title="Загружаем магазин"
            description="Секунду — проверяем кабинет."
          />
        ) : null}

        {shopQuery.isError ? (
          <OrdersLoadError
            error={shopQuery.error}
            onRetry={() => void shopQuery.refetch()}
            next="/admin/orders"
          />
        ) : null}

        {shopQuery.isSuccess && !shop ? (
          <ScreenState
            kind="empty"
            title="Сначала создайте магазин"
            description="Заказы поступают в магазин. Настройте витрину, опубликуйте её — и заявки покупателей появятся здесь."
            action={
              <Link to="/admin/shop" className={buttonVariants({ variant: "outline" })}>
                Настроить магазин
              </Link>
            }
          />
        ) : null}

        {shop ? (
          <>
            {ordersQuery.isPending ? (
              <ScreenState
                kind="loading"
                title="Загружаем заказы"
                description="Секунду — собираем заявки магазина."
              />
            ) : null}

            {ordersQuery.isError ? (
              <OrdersLoadError
                error={ordersQuery.error}
                onRetry={() => void ordersQuery.refetch()}
                next="/admin/orders"
              />
            ) : null}

            {ordersQuery.isSuccess && orders.length === 0 ? (
              <ScreenState
                kind="empty"
                title="Заказов пока нет"
                description="Когда покупатель оформит заказ, он появится здесь с составом и контактами."
              />
            ) : null}

            {ordersQuery.isSuccess && orders.length > 0 ? (
              <>
                <OrdersTable orders={orders} />
                <OrdersCards orders={orders} />
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function orderItemsLabel(order: OrderSummary): string {
  return order.items.map((item) => item.name).join(", ");
}

function OrdersTable({ orders }: { orders: OrderSummary[] }) {
  return (
    <div className="hidden lg:block">
      <table className="w-full table-fixed border-collapse border-[3px] border-ink bg-paper">
        <caption className="sr-only">Заказы вашего магазина</caption>
        <thead className="sticky top-0 z-10 bg-paper">
          <tr className="border-b-[3px] border-ink text-left font-mono text-[10px] uppercase tracking-[0.18em]">
            <th scope="col" className="w-[10%] px-3 py-3">
              №
            </th>
            <th scope="col" className="w-[17%] px-3 py-3">
              Дата
            </th>
            <th scope="col" className="w-[20%] px-3 py-3">
              Покупатель
            </th>
            <th scope="col" className="w-[22%] px-3 py-3">
              Состав
            </th>
            <th scope="col" className="w-[12%] px-3 py-3">
              Сумма
            </th>
            <th scope="col" className="w-[10%] px-3 py-3">
              Статус
            </th>
            <th scope="col" className="w-[9%] px-3 py-3">
              Действия
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b-[3px] border-ink align-top last:border-b-0">
              <th scope="row" className="px-3 py-4 text-left font-mono text-sm font-semibold">
                {order.id}
              </th>
              <td className="break-words px-3 py-4 font-mono text-[11px] leading-relaxed">
                {formatOrderDate(order.createdAt)}
              </td>
              <td className="break-words px-3 py-4 font-mono text-xs">
                {formatOrderPhone(order.buyerPhone)}
              </td>
              <td className="px-3 py-4 text-sm leading-relaxed">
                <span className="line-clamp-2 break-words">{orderItemsLabel(order)}</span>
                {order.comment ? (
                  <span className="mt-1 line-clamp-2 block break-words text-xs text-ink/60">
                    Комментарий: {order.comment}
                  </span>
                ) : null}
              </td>
              <td className="break-words px-3 py-4 font-mono text-xs tabular-nums">
                {formatRubles(kopecks(order.totalKopecks))}
              </td>
              <td className="px-3 py-4">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="px-3 py-4">
                <Link
                  to={`/admin/orders/${order.id}`}
                  className="inline-flex min-h-11 items-center border-[3px] border-ink px-2 font-mono text-[10px] uppercase tracking-[0.1em] whitespace-nowrap hover:bg-ink hover:text-paper"
                >
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersCards({ orders }: { orders: OrderSummary[] }) {
  return (
    <ul className="grid gap-3 lg:hidden">
      {orders.map((order) => (
        <li key={order.id} className="border-[3px] border-ink bg-paper p-4 shadow-brutal-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-display text-lg uppercase leading-tight">Заказ №{order.id}</h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink/60">
                {formatOrderDate(order.createdAt)}
              </p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          <p className="mt-3 font-mono text-xs">{formatOrderPhone(order.buyerPhone)}</p>
          <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed">
            {orderItemsLabel(order)}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink/60">
            {pluralizeItems(order.items.length)}
          </p>
          <p className="mt-3 font-mono text-base font-semibold tabular-nums">
            {formatRubles(kopecks(order.totalKopecks))}
          </p>

          <Link
            to={`/admin/orders/${order.id}`}
            className={buttonVariants({
              variant: "outline",
              className: "mt-4 w-full",
            })}
          >
            Открыть заказ
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OrdersLoadError({
  error,
  onRetry,
  next,
}: {
  error: unknown;
  onRetry: () => void;
  next: string;
}) {
  if (error instanceof ApiError && error.status === 401) {
    return <SessionExpiredState next={next} />;
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
