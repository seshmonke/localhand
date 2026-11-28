import { formatRubles, kopecks, type OrderPayment, type OrderSummary } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { ScreenState } from "../components/ScreenState.js";
import { AdminDeliveryCard } from "../components/admin/AdminDeliveryCard.js";
import { PaymentStatusBadge } from "../components/admin/PaymentStatusBadge.js";
import { SessionExpiredState } from "../components/admin/SessionExpiredState.js";
import {
  Card,
  Grid,
  GridColumn,
  PageHeader,
  PageShell,
  Sidebar,
  Stack,
} from "../components/layout/index.js";
import { ApiError } from "../lib/api.js";
import { useSellerOrderPaymentQuery, useSellerOrderQuery } from "../lib/queries.js";
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
  const paymentQuery = useSellerOrderPaymentQuery(isValidId ? orderId : 0, orderQuery.isSuccess);

  if (!isValidId) {
    return (
      <PageShell size="admin">
        <h1 className="sr-only">Заказ</h1>
        <AdminOrderNotFound />
      </PageShell>
    );
  }

  if (orderQuery.isPending) {
    return (
      <PageShell size="admin">
        <h1 className="sr-only">Заказ №{orderId}</h1>
        <ScreenState
          kind="loading"
          title="Загружаем заказ"
          description="Секунду — проверяем детали."
        />
      </PageShell>
    );
  }

  if (orderQuery.isError) {
    const error = orderQuery.error;
    if (error instanceof ApiError && error.status === 401) {
      return (
        <PageShell size="admin">
          <h1 className="sr-only">Заказ №{orderId}</h1>
          <SessionExpiredState next={`/admin/orders/${orderId}`} />
        </PageShell>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <PageShell size="admin">
          <h1 className="sr-only">Заказ №{orderId}</h1>
          <AdminOrderNotFound />
        </PageShell>
      );
    }

    return (
      <PageShell size="admin">
        <h1 className="sr-only">Заказ №{orderId}</h1>
        <ScreenState
          kind="error"
          title="Заказ не загрузился"
          description="Проверьте соединение и попробуйте снова."
          action={<Button onClick={() => void orderQuery.refetch()}>Повторить</Button>}
        />
      </PageShell>
    );
  }

  const order = orderQuery.data.order;

  return (
    <PageShell size="admin">
      <Stack gap={8}>
        <Stack gap={4}>
          <Link
            to="/admin/orders"
            className="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />К заказам
          </Link>

          <PageHeader
            size="admin"
            eyebrow="Кабинет продавца"
            title={`Заказ №${order.id}`}
            actions={<OrderStatusBadge status={order.status} />}
            description={
              <time dateTime={order.createdAt}>Создан {formatOrderDate(order.createdAt)}</time>
            }
            descriptionClassName="font-mono text-[10px] uppercase tracking-wide text-ink/60"
          />
        </Stack>

        <Grid className="gap-y-6 lg:items-start">
          <GridColumn span={8}>
            <Card as="section" aria-labelledby="admin-order-items-title">
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
              <div className="mt-6 flex justify-between gap-4 border-t-[3px] border-ink pt-4 font-mono text-base">
                <span className="uppercase">Итого</span>
                <span className="font-semibold tabular-nums">
                  {formatRubles(kopecks(order.totalKopecks))}
                </span>
              </div>
            </Card>
          </GridColumn>

          <Sidebar>
            <Stack gap={4}>
              <Card as="section" aria-labelledby="admin-order-contact-title">
                <h2
                  id="admin-order-contact-title"
                  className="font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  Покупатель
                </h2>
                <dl className="mt-4 flex flex-col gap-4 text-sm">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                      Телефон
                    </dt>
                    <dd className="mt-2 font-mono text-sm font-semibold">
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
                    <dd className="mt-2 break-words leading-relaxed">
                      {order.comment ?? "Без комментария"}
                    </dd>
                  </div>
                </dl>
              </Card>

              <AdminOrderPaymentCard
                orderStatus={order.status}
                payment={paymentQuery.data?.payment ?? null}
                loading={paymentQuery.isPending}
                error={paymentQuery.isError}
                onRetry={() => void paymentQuery.refetch()}
              />

              <AdminDeliveryCard
                orderId={order.id}
                orderStatus={order.status}
                delivery={order.delivery}
              />

              <Card as="section" tone="inverse" aria-labelledby="admin-order-help-title">
                <h2
                  id="admin-order-help-title"
                  className="font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  Что дальше
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-inverse-text/85">
                  Свяжитесь с покупателем по телефону и согласуйте передачу вещи. Статус оплаты
                  показывается отдельно от статуса заказа.
                </p>
              </Card>

              <Link
                to="/admin/orders"
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                Все заказы
              </Link>
            </Stack>
          </Sidebar>
        </Grid>
      </Stack>
    </PageShell>
  );
}

function AdminOrderPaymentCard({
  orderStatus,
  payment,
  loading,
  error,
  onRetry,
}: {
  orderStatus: OrderSummary["status"];
  payment: OrderPayment | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <Card as="section" aria-labelledby="admin-order-payment-title">
      <h2
        id="admin-order-payment-title"
        className="font-mono text-[10px] uppercase tracking-[0.2em]"
      >
        Оплата
      </h2>

      {loading ? (
        <output aria-live="polite" className="mt-4 block text-sm">
          Загружаем оплату…
        </output>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm leading-relaxed">
          Статус оплаты недоступен.{" "}
          <button
            type="button"
            className="underline decoration-[3px] underline-offset-4"
            onClick={onRetry}
          >
            Повторить
          </button>
        </p>
      ) : null}

      {!loading && !error && payment === null ? (
        orderStatus === "paid" ? (
          <>
            <p className="mt-4 text-sm font-semibold leading-relaxed">Оплачен</p>
            <p className="mt-2 text-xs leading-relaxed text-ink/60">
              Платёж не найден; статус взят из заказа.
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm leading-relaxed">
            Платёж не начат. Покупатель ещё не оплатил.
          </p>
        )
      ) : null}

      {payment ? (
        <>
          <div className="mt-4">
            <PaymentStatusBadge status={payment.status} />
          </div>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">Сумма</dt>
              <dd className="font-mono text-sm font-semibold">
                {formatRubles(kopecks(payment.amountKopecks))}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">Создан</dt>
              <dd className="font-mono text-xs">{formatOrderDate(payment.createdAt)}</dd>
            </div>
            {payment.paidAt ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                  Оплачен
                </dt>
                <dd className="font-mono text-xs">{formatOrderDate(payment.paidAt)}</dd>
              </div>
            ) : null}
          </dl>
          {payment.status === "manual_review" ? (
            <p className="mt-4 border-l-[3px] border-accent-red pl-2 text-sm font-semibold leading-relaxed">
              Платёж на ручной проверке. Поддержка разберётся с платежом; заказ не переводится в
              «Оплачен» автоматически.
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
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
