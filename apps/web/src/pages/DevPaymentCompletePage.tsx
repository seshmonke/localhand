import { Button, buttonVariants } from "@localhand/ui";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Card, PageShell, Stack } from "../components/layout/index.js";
import { ApiError, completeDevPayment, sendPaymentWebhook } from "../lib/api.js";

/**
 * Dev-only fake payment page. It completes the fake provider payment, then
 * calls the real webhook route so the browser flow reaches the same `paid`
 * transition as a production webhook. The route is not registered in a
 * production build.
 */
export function DevPaymentCompletePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const paymentId = Number(id);
  const isValidId = Number.isInteger(paymentId) && paymentId > 0;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState<number | null>(null);
  const [webhookFailed, setWebhookFailed] = useState(false);

  async function complete() {
    setPending(true);
    setError(null);
    setWebhookFailed(false);
    try {
      const result = await completeDevPayment(paymentId);
      setCompletedOrderId(result.orderId);
      try {
        await sendPaymentWebhook(result.providerPaymentId);
      } catch {
        setWebhookFailed(true);
        setPending(false);
        return;
      }
      navigate(`/orders/${result.orderId}?payment=return`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 409 || caught.status === 404)) {
        setError("Платёж уже завершён или недоступен.");
      } else if (caught instanceof ApiError && caught.status === 401) {
        setError("Сессия истекла. Войдите снова и откройте заказ.");
      } else {
        setError("Не удалось завершить тестовую оплату. Попробуйте ещё раз.");
      }
      setPending(false);
    }
  }

  return (
    <PageShell size="admin" className="items-center justify-center py-10 sm:py-16">
      <Stack gap={4} className="w-full max-w-xl">
        <Card as="section" aria-labelledby="dev-complete-title">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/60">
            Тестовый режим (fake)
          </p>
          <h1
            id="dev-complete-title"
            className="mt-2 font-display text-3xl uppercase leading-tight"
          >
            Тестовая оплата
          </h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-wide text-ink/60">
            Платёж №{isValidId ? paymentId : "—"}
          </p>
          <p className="mt-4 text-sm leading-relaxed">
            Реальные деньги не списываются. Нажмите кнопку, чтобы завершить тестовый платёж и
            отправить вебхук — заказ перейдёт в «Оплачен».
          </p>

          {error ? (
            <div role="alert" className="mt-4 border-[3px] border-ink bg-accent-orange/15 p-3">
              <p className="text-sm font-semibold leading-relaxed">{error}</p>
              <Link
                to="/orders"
                className="mt-2 inline-flex min-h-11 items-center font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4"
              >
                Вернуться к заказам
              </Link>
            </div>
          ) : null}

          {webhookFailed && completedOrderId !== null ? (
            <div role="alert" className="mt-4 border-[3px] border-ink bg-accent-orange/15 p-3">
              <p className="text-sm font-semibold leading-relaxed">
                Платёж проведён, но статус не обновился. Вернитесь в заказ и нажмите «Проверить ещё
                раз».
              </p>
              <Link
                to={`/orders/${completedOrderId}?payment=return`}
                className="mt-2 inline-flex min-h-11 items-center font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4"
              >
                Вернуться к заказу
              </Link>
            </div>
          ) : null}

          {!webhookFailed ? (
            <Button
              className="mt-6 w-full"
              onClick={() => void complete()}
              disabled={pending || !isValidId}
            >
              {pending ? "Проводим платёж…" : "Оплатить тестовым платежом"}
            </Button>
          ) : null}

          <Link
            to="/orders"
            className={buttonVariants({ variant: "outline", className: "mt-3 w-full" })}
          >
            К заказам
          </Link>
        </Card>
      </Stack>
    </PageShell>
  );
}
