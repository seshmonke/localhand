import { formatRubles, kopecks } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { ScreenState } from "../components/ScreenState.js";
import { SessionExpiredState } from "../components/admin/SessionExpiredState.js";
import { ApiError } from "../lib/api.js";
import { useSellerOrderQuery } from "../lib/queries.js";
import {
  formatOrderDate,
  formatOrderPhone,
  OrderItemsList,
  OrderStatusBadge,
} from "./OrdersPage.js";

export function AdminOrderPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const isValidId = Number.isInteger(orderId) && orderId > 0;
  const orderQuery = useSellerOrderQuery(isValidId ? orderId : 0);

  if (!isValidId) {
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <h1 className="sr-only">Заказ</h1>
        <AdminOrderNotFound />
      </div>
    );
  }

  if (orderQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <h1 className="sr-only">Заказ №{orderId}</h1>
        <ScreenState
          kind="loading"
          title="Загружаем заказ"
          description="Секунду — проверяем детали."
        />
      </div>
    );
  }

  if (orderQuery.isError) {
    const error = orderQuery.error;
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="mx-auto w-full max-w-[1100px]">
          <h1 className="sr-only">Заказ №{orderId}</h1>
          <SessionExpiredState next={`/admin/orders/${orderId}`} />
        </div>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="mx-auto w-full max-w-[1100px]">
          <h1 className="sr-only">Заказ №{orderId}</h1>
          <AdminOrderNotFound />
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <h1 className="sr-only">Заказ №{orderId}</h1>
        <ScreenState
          kind="error"
          title="Заказ не загрузился"
          description="Проверьте соединение и попробуйте снова."
          action={<Button onClick={() => void orderQuery.refetch()}>Повторить</Button>}
        />
      </div>
    );
  }

  const order = orderQuery.data.order;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <Link
        to="/admin/orders"
        className="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />К заказам
      </Link>

      <header className="mt-4 border-b-[3px] border-ink pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
          Кабинет продавца
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl uppercase leading-none sm:text-4xl">
            Заказ №{order.id}
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <time
          dateTime={order.createdAt}
          className="mt-3 block font-mono text-[10px] uppercase tracking-wide text-ink/60"
        >
          Создан {formatOrderDate(order.createdAt)}
        </time>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section
          aria-labelledby="admin-order-items-title"
          className="min-w-0 border-[3px] border-ink bg-paper p-4 sm:p-6"
        >
          <h2 id="admin-order-items-title" className="font-display text-2xl uppercase">
            Состав
          </h2>
          <p className="mt-2 text-sm leading-relaxed">
            Магазин:{" "}
            <Link
              to={`/shops/${order.shop.slug}`}
              className="break-words font-semibold underline-offset-4 hover:underline"
            >
              {order.shop.name}
            </Link>
          </p>
          <OrderItemsList items={order.items} label={`Состав заказа №${order.id}`} />
          <div className="mt-5 flex justify-between gap-4 border-t-[3px] border-ink pt-4 font-mono text-base">
            <span className="uppercase">Итого</span>
            <span className="font-semibold tabular-nums">
              {formatRubles(kopecks(order.totalKopecks))}
            </span>
          </div>
        </section>

        <aside className="space-y-4">
          <section
            aria-labelledby="admin-order-contact-title"
            className="border-[3px] border-ink bg-paper p-4 sm:p-5"
          >
            <h2
              id="admin-order-contact-title"
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
            >
              Покупатель
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                  Телефон
                </dt>
                <dd className="mt-1 font-mono text-sm font-semibold">
                  <a
                    href={`tel:${order.buyerPhone}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {formatOrderPhone(order.buyerPhone)}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                  Комментарий
                </dt>
                <dd className="mt-1 break-words leading-relaxed">
                  {order.comment ?? "Без комментария"}
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="admin-order-help-title"
            className="border-[3px] border-ink bg-inverse p-4 text-inverse-text sm:p-5"
          >
            <h2
              id="admin-order-help-title"
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
            >
              Что дальше
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-inverse-text/85">
              Свяжитесь с покупателем по телефону и согласуйте передачу вещи. Статусы и оплата
              появятся в следующих обновлениях.
            </p>
          </section>

          <Link
            to="/admin/orders"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            Все заказы
          </Link>
        </aside>
      </div>
    </div>
  );
}

function AdminOrderNotFound() {
  return (
    <ScreenState
      kind="empty"
      title="Заказ не найден"
      description="Заказ мог быть удалён или оформлен в другом магазине."
      action={
        <Link to="/admin/orders" className={buttonVariants({ variant: "outline" })}>
          К списку заказов
        </Link>
      }
    />
  );
}
