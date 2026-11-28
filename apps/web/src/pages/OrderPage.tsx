import { formatRubles, kopecks, type OrderPayment, type OrderSummary } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Translate = ReturnType<typeof useTranslation>["t"];
import { Link, useParams, useSearchParams } from "react-router";
import { FormError } from "../components/FormField.js";
import { DeliverySummaryCard } from "../components/orders/DeliverySummaryCard.js";
import { ScreenState } from "../components/ScreenState.js";
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
import { ApiError, createOrderPayment } from "../lib/api.js";
import { goToExternal } from "../lib/navigation.js";
import { orderKeys, useOrderPaymentQuery, useOrderQuery } from "../lib/queries.js";
import {
  formatOrderDate,
  formatOrderPhone,
  OrderItemsList,
  OrderStatusBadge,
} from "./OrdersPage.js";

export const ATTEMPT_KEY_PREFIX = "localhand.payment.attempt.";
const PAYMENT_POLL_TIMEOUT_MS = 60_000;

function BackToOrders() {
  const { t } = useTranslation();
  return (
    <Link
      to="/orders"
      className="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {t("order.back")}
    </Link>
  );
}

/**
 * One Idempotency-Key per payment attempt. A retry of an unknown provider
 * outcome reuses the stored key; after a terminal attempt (canceled/failed) a
 * new key is generated so the seller can be charged again.
 */
export function attemptKeyFor(
  orderId: number,
  current: OrderPayment | null,
  fallback: { orderId: number; key: string } | null,
): string {
  const storageKey = `${ATTEMPT_KEY_PREFIX}${orderId}`;
  const terminal =
    current !== null && current.status !== "pending" && current.status !== "manual_review";

  try {
    if (terminal) {
      window.sessionStorage.removeItem(storageKey);
    }
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    if (terminal || fallback === null || fallback.orderId !== orderId) {
      return crypto.randomUUID();
    }
    return fallback.key;
  }
}

function payErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "seller_payment_unavailable":
        return t("order.payment.unavailable.description");
      case "payment_in_progress":
        return t("order.payment.error.inProgress");
      case "payment_requires_review":
        return t("order.payment.error.requiresReview");
      case "order_already_paid":
        return t("order.payment.error.alreadyPaid");
      case "zero_amount":
        return t("order.payment.error.zeroAmount");
      case "invalid_order_transition":
        return t("order.payment.error.invalidTransition");
      case "rate_limited":
        return t("order.payment.error.rateLimited");
      case "provider_unavailable":
        return t("payment.error.providerUnavailable");
      case "unauthorized":
        return t("common.sessionExpired.inline");
      default:
        return t("order.payment.error.generic");
    }
  }
  return t("order.payment.error.network");
}

function isRefetchableConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.code === "payment_in_progress" ||
      error.code === "payment_requires_review" ||
      error.code === "order_already_paid" ||
      error.code === "invalid_order_transition")
  );
}

function OrderBadge({ order, payment }: { order: OrderSummary; payment: OrderPayment | null }) {
  if (payment) {
    return <PaymentStatusBadge status={payment.status} />;
  }
  return <OrderStatusBadge status={order.status} />;
}

function PaymentDetails({
  order,
  payment,
  returnedFromPayment,
  pollExpired,
  onRecheck,
  rechecking,
}: {
  order: OrderSummary;
  payment: OrderPayment | null;
  returnedFromPayment: boolean;
  pollExpired: boolean;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const { t } = useTranslation();
  if (payment === null) {
    if (order.status === "paid") {
      return <p className="mt-4 text-sm leading-relaxed">{t("order.payment.paid")}</p>;
    }
    if (order.status === "payment_pending") {
      return <p className="mt-4 text-sm leading-relaxed">{t("order.payment.creating")}</p>;
    }
    return (
      <>
        <p className="mt-4 text-sm font-semibold leading-relaxed">
          {t("order.payment.notStarted.title")}
        </p>
        <p className="mt-2 text-sm leading-relaxed">{t("order.payment.notStarted.description")}</p>
      </>
    );
  }

  if (payment.status === "pending") {
    if (payment.confirmationUrl === null) {
      return (
        <>
          <p className="mt-4 text-sm font-semibold leading-relaxed">
            {t("order.payment.confirmFailed.title")}
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            {t("order.payment.confirmFailed.description")}
          </p>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
                {t("order.payment.amount")}
              </dt>
              <dd className="font-mono text-sm font-semibold">
                {formatRubles(kopecks(payment.amountKopecks))}
              </dd>
            </div>
          </dl>
        </>
      );
    }
    return (
      <>
        <p className="mt-4 text-sm font-semibold leading-relaxed">{t("payment.status.pending")}</p>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
              {t("order.payment.amount")}
            </dt>
            <dd className="font-mono text-sm font-semibold">
              {formatRubles(kopecks(payment.amountKopecks))}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed" aria-live="polite">
          {returnedFromPayment ? t("order.payment.returned") : t("order.payment.checking")}
        </p>
        {payment.confirmationUrl ? (
          <a
            href={payment.confirmationUrl}
            className={buttonVariants({ variant: "outline", className: "mt-4 w-full" })}
          >
            {t("order.payment.continue")}
          </a>
        ) : null}
        {returnedFromPayment && pollExpired ? (
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={onRecheck}
            disabled={rechecking}
          >
            {rechecking ? t("order.payment.rechecking") : t("order.payment.recheck")}
          </Button>
        ) : null}
      </>
    );
  }

  if (payment.status === "manual_review") {
    return (
      <>
        <p className="mt-4 text-sm font-semibold leading-relaxed">
          {t("payment.status.manualReview")}
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          {t("order.payment.manualReview.description")}
        </p>
      </>
    );
  }

  if (payment.status === "succeeded") {
    return (
      <>
        <p className="mt-4 text-sm font-semibold leading-relaxed">
          {t("payment.status.succeeded")}
        </p>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
              {t("order.payment.amount")}
            </dt>
            <dd className="font-mono text-sm font-semibold">
              {formatRubles(kopecks(payment.amountKopecks))}
            </dd>
          </div>
        </dl>
        {payment.paidAt ? (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-ink/60">
            {t("order.payment.paidAt", { date: formatOrderDate(payment.paidAt) })}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm font-semibold leading-relaxed">
        {payment.status === "canceled" ? t("payment.status.canceled") : t("payment.status.failed")}
      </p>
      <p className="mt-2 text-sm leading-relaxed">{t("order.payment.retryHint")}</p>
    </>
  );
}

export function OrderPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const orderId = Number(id);
  const isValidId = Number.isInteger(orderId) && orderId > 0;
  const orderQuery = useOrderQuery(isValidId ? orderId : 0);

  const returnedFromPayment = searchParams.get("payment") === "return";
  const [poll, setPoll] = useState<{ orderId: number; expired: boolean } | null>(null);
  const [pollCycle, setPollCycle] = useState(0);
  const attemptKeyRef = useRef<{ orderId: number; key: string } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!returnedFromPayment) {
      return;
    }
    const timer = window.setTimeout(
      () => setPoll({ orderId, expired: true }),
      PAYMENT_POLL_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [returnedFromPayment, orderId, pollCycle]);

  // A poll result belongs to one order; navigating to another order starts a
  // fresh window without a synchronous state reset inside the effect.
  const pollExpired = poll?.orderId === orderId && poll.expired;

  const paymentQuery = useOrderPaymentQuery(orderId, {
    enabled: isValidId && orderQuery.isSuccess,
    poll: returnedFromPayment && !pollExpired,
  });

  const [paymentUnavailable, setPaymentUnavailable] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const payment = paymentQuery.data?.payment ?? null;
  const paymentStatus = payment?.status;
  const refetchOrder = orderQuery.refetch;

  // A terminal payment can change the order status (canceled → new,
  // succeeded → paid) without the order query knowing. Refresh it so the
  // retry/paid UI is correct without a page reload.
  useEffect(() => {
    if (
      paymentStatus === "canceled" ||
      paymentStatus === "failed" ||
      paymentStatus === "succeeded" ||
      paymentStatus === "manual_review"
    ) {
      void refetchOrder();
    }
  }, [paymentStatus, refetchOrder]);

  const payMutation = useMutation({
    mutationFn: () => {
      const key = attemptKeyFor(orderId, payment, attemptKeyRef.current);
      if (attemptKeyRef.current?.orderId !== orderId) {
        attemptKeyRef.current = { orderId, key };
      }
      return createOrderPayment(orderId, key);
    },
    onSuccess: (data) => {
      setPayError(null);
      setPaymentUnavailable(false);
      queryClient.setQueryData(orderKeys.payment(orderId), data);
      if (data.payment.confirmationUrl) {
        goToExternal(data.payment.confirmationUrl);
      } else {
        void paymentQuery.refetch();
      }
    },
    onError: (error) => {
      if (isRefetchableConflict(error)) {
        setPayError(null);
        setPaymentUnavailable(false);
        void paymentQuery.refetch();
        void orderQuery.refetch();
        return;
      }
      if (error instanceof ApiError && error.code === "seller_payment_unavailable") {
        setPaymentUnavailable(true);
        setPayError(null);
        return;
      }
      setPayError(payErrorMessage(error, t));
    },
  });

  if (!isValidId) {
    return (
      <PageShell className="py-10 sm:py-12">
        <h1 className="sr-only">{t("order.eyebrow")}</h1>
        <OrderNotFound />
      </PageShell>
    );
  }

  if (orderQuery.isPending) {
    return (
      <PageShell className="py-10 sm:py-12">
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
        <PageShell className="py-10 sm:py-12">
          <h1 className="sr-only">{t("order.title", { id: orderId })}</h1>
          <SessionExpiredState next={`/orders/${orderId}`} />
        </PageShell>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <PageShell className="py-10 sm:py-12">
          <h1 className="sr-only">{t("order.title", { id: orderId })}</h1>
          <OrderNotFound />
        </PageShell>
      );
    }

    return (
      <PageShell className="py-10 sm:py-12">
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
  const showUnavailable = paymentUnavailable && payment === null;
  const canPay =
    order.status === "new" &&
    !showUnavailable &&
    (payment === null ||
      payment.status === "canceled" ||
      payment.status === "failed" ||
      (payment.status === "pending" && payment.confirmationUrl === null));
  const payLabel =
    payment !== null && (payment.status === "canceled" || payment.status === "failed")
      ? t("order.payment.payAgain")
      : payment !== null && payment.status === "pending" && payment.confirmationUrl === null
        ? t("order.payment.retryPay")
        : t("order.payment.pay");

  return (
    <PageShell className="py-10 sm:py-12">
      <Stack gap={8}>
        <Stack gap={4}>
          <BackToOrders />

          <PageHeader
            eyebrow={t("order.eyebrow")}
            title={t("order.title", { id: order.id })}
            actions={<OrderBadge order={order} payment={payment} />}
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
            <Card as="section" aria-labelledby="order-items-title">
              <h2 id="order-items-title" className="font-display text-2xl uppercase">
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
              <Card as="section" aria-labelledby="order-payment-title">
                <h2
                  id="order-payment-title"
                  className="font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  {t("order.payment.title")}
                </h2>

                {paymentQuery.isPending ? (
                  <output aria-live="polite" className="mt-4 block text-sm">
                    {t("order.payment.loading")}
                  </output>
                ) : null}

                {paymentQuery.isError ? (
                  <p className="mt-4 text-sm leading-relaxed">
                    {t("order.payment.readError")}{" "}
                    <button
                      type="button"
                      className="underline decoration-[3px] underline-offset-4"
                      onClick={() => void paymentQuery.refetch()}
                    >
                      {t("common.retry")}
                    </button>
                  </p>
                ) : null}

                {paymentQuery.isSuccess ? (
                  <>
                    {showUnavailable ? (
                      <>
                        <p className="mt-4 text-sm font-semibold leading-relaxed">
                          {t("order.payment.unavailable.title")}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed">
                          {t("order.payment.unavailable.description")}
                        </p>
                        <Button
                          variant="outline"
                          className="mt-4 w-full"
                          onClick={() => {
                            setPaymentUnavailable(false);
                            void paymentQuery.refetch();
                            void orderQuery.refetch();
                          }}
                        >
                          {t("order.payment.recheck")}
                        </Button>
                      </>
                    ) : (
                      <PaymentDetails
                        order={order}
                        payment={payment}
                        returnedFromPayment={returnedFromPayment}
                        pollExpired={pollExpired}
                        onRecheck={() => {
                          setPoll(null);
                          setPollCycle((cycle) => cycle + 1);
                          void paymentQuery.refetch();
                          void orderQuery.refetch();
                        }}
                        rechecking={paymentQuery.isFetching}
                      />
                    )}

                    <FormError message={payError} />

                    {canPay ? (
                      <Button
                        className="mt-4 w-full"
                        onClick={() => payMutation.mutate()}
                        disabled={payMutation.isPending}
                      >
                        {payMutation.isPending ? t("order.payment.creatingPayment") : payLabel}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </Card>

              <DeliverySummaryCard delivery={order.delivery} role={"buyer" as const} />

              <Card as="section" aria-labelledby="order-contact-title">
                <h2
                  id="order-contact-title"
                  className="font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  {t("order.contacts.title")}
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

              <Card as="section" tone="inverse" aria-labelledby="order-help-title">
                <h2
                  id="order-help-title"
                  className="font-mono text-[10px] uppercase tracking-[0.2em]"
                >
                  {t("order.next.title")}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-inverse-text/85">
                  {t("order.next.description")}
                </p>
              </Card>

              <Link
                to="/orders"
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

function OrderNotFound() {
  const { t } = useTranslation();
  return (
    <ScreenState
      kind="empty"
      title={t("order.notFound.title")}
      description={t("order.notFound.description")}
      action={
        <Link to="/orders" className={buttonVariants({ variant: "outline" })}>
          {t("order.notFound.action")}
        </Link>
      }
    />
  );
}
