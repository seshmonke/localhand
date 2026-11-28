import { formatRubles, kopecks, type OrderPayment, type OrderSummary } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { id } = useParams();
  const orderId = Number(id);
  const isValidId = Number.isInteger(orderId) && orderId > 0;
  const orderQuery = useSellerOrderQuery(isValidId ? orderId : 0);
  const paymentQuery = useSellerOrderPaymentQuery(isValidId ? orderId : 0, orderQuery.isSuccess);

  if (!isValidId) {
    return (
      <PageShell size="admin">
        <h1 className="sr-only">{t("order.eyebrow")}</h1>
        <AdminOrderNotFound />
      </PageShell>
    );
  }

  if (orderQuery.isPending) {
    return (
      <PageShell size="admin">
        <h1 className="sr-only">{t("order.title", { id: orderId })}</h1>
        <ScreenState
          kind="loading"
          title={t("order.loading.title")}
          description={t("order.loading.description")}
        />
      </PageShell>
    );
  }

  if (orderQuery.isError) {
    const error = orderQuery.error;
    if (error instanceof ApiError && error.status === 401) {
      return (
        <PageShell size="admin">
          <h1 className="sr-only">{t("order.title", { id: orderId })}</h1>
          <SessionExpiredState next={`/admin/orders/${orderId}`} />
        </PageShell>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <PageShell size="admin">
          <h1 className="sr-only">{t("order.title", { id: orderId })}</h1>
          <AdminOrderNotFound />
        </PageShell>
      );
    }

    return (
      <PageShell size="admin">
        <h1 className="sr-only">{t("order.title", { id: orderId })}</h1>
        <ScreenState
          kind="error"
          title={t("order.error.title")}
          description={t("order.error.description")}
          action={<Button onClick={() => void orderQuery.refetch()}>{t("common.retry")}</Button>}
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
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("order.back")}
          </Link>

          <PageHeader
            size="admin"
            eyebrow={t("admin.order.eyebrow")}
            title={t("order.title", { id: order.id })}
            actions={<OrderStatusBadge status={order.status} />}
            description={
              <time dateTime={order.createdAt}>
                {t("order.created", { date: formatOrderDate(order.createdAt) })}
              </time>
            }
            descriptionClassName="font-mono text-[10px] uppercase tracking-wide text-ink/60"
          />
        </Stack>

        <Grid className="gap-y-6 lg:items-start">
          <GridColumn span={8}>
            <Card as="section" aria-labelledby="admin-order-items-title">
              <h2 id="admin-order-items-title" className="font-display text-2xl uppercase">
                {t("order.items.title")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed">
                {t("order.shopPrefix")}{" "}
                <Link
                  to={`/shops/${order.shop.slug}`}
                  className="break-words font-semibold underline-offset-4 hover:underline"
                >
                  {order.shop.name}
                </Link>
              </p>
              <OrderItemsList
                items={order.items}
                label={t("order.items.label", { id: order.id })}
              />
              <div className="mt-6 flex justify-between gap-4 border-t-[3px] border-ink pt-4 font-mono text-base">
                <span className="uppercase">{t("order.total")}</span>
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
                  {t("admin.order.buyer")}
                </h2>
                <dl className="mt-4 flex flex-col gap-4 text-sm">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                      {t("order.contacts.phone")}
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
                      {t("order.contacts.comment")}
                    </dt>
                    <dd className="mt-2 break-words leading-relaxed">
                      {order.comment ?? t("order.contacts.noComment")}
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
                  {t("order.next.title")}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-inverse-text/85">
                  {t("admin.order.next.description")}
                </p>
              </Card>

              <Link
                to="/admin/orders"
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                {t("order.all")}
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
  const { t } = useTranslation();
  return (
    <Card as="section" aria-labelledby="admin-order-payment-title">
      <h2
        id="admin-order-payment-title"
        className="font-mono text-[10px] uppercase tracking-[0.2em]"
      >
        {t("order.payment.title")}
      </h2>

      {loading ? (
        <output aria-live="polite" className="mt-4 block text-sm">
          {t("admin.order.payment.loading")}
        </output>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm leading-relaxed">
          {t("payment.read.error")}.{" "}
          <button
            type="button"
            className="underline decoration-[3px] underline-offset-4"
            onClick={onRetry}
          >
            {t("common.retry")}
          </button>
        </p>
      ) : null}

      {!loading && !error && payment === null ? (
        orderStatus === "paid" ? (
          <>
            <p className="mt-4 text-sm font-semibold leading-relaxed">
              {t("payment.status.succeeded")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink/60">
              {t("admin.order.payment.notFound")}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm leading-relaxed">{t("admin.order.payment.notStarted")}</p>
        )
      ) : null}

      {payment ? (
        <>
          <div className="mt-4">
            <PaymentStatusBadge status={payment.status} />
          </div>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                {t("order.payment.amount")}
              </dt>
              <dd className="font-mono text-sm font-semibold">
                {formatRubles(kopecks(payment.amountKopecks))}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                {t("admin.order.payment.created")}
              </dt>
              <dd className="font-mono text-xs">{formatOrderDate(payment.createdAt)}</dd>
            </div>
            {payment.paidAt ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                  {t("payment.status.succeeded")}
                </dt>
                <dd className="font-mono text-xs">{formatOrderDate(payment.paidAt)}</dd>
              </div>
            ) : null}
          </dl>
          {payment.status === "manual_review" ? (
            <p className="mt-4 border-l-[3px] border-accent-red pl-2 text-sm font-semibold leading-relaxed">
              {t("admin.order.payment.manualReview")}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function AdminOrderNotFound() {
  const { t } = useTranslation();
  return (
    <ScreenState
      kind="empty"
      title={t("order.notFound.title")}
      description={t("admin.order.notFound.description")}
      action={
        <Link to="/admin/orders" className={buttonVariants({ variant: "outline" })}>
          {t("order.notFound.action")}
        </Link>
      }
    />
  );
}
