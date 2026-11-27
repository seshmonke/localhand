import type { SellerPaymentAccount } from "@localhand/shared";
import { Button } from "@localhand/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { connectSellerPayments, disconnectSellerPayments } from "../../lib/api.js";
import { ApiError } from "../../lib/api.js";
import { goToExternal } from "../../lib/navigation.js";
import { sellerKeys, useSellerPaymentAccountQuery } from "../../lib/queries.js";
import { Card } from "../layout/index.js";
import { FormError } from "../FormField.js";

function paymentErrorMessage(error: unknown, action: "connect" | "disconnect"): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Сессия истекла. Войдите снова.";
    }
    if (action === "connect") {
      if (error.status === 502) {
        return "Платёжный сервис недоступен. Попробуйте ещё раз.";
      }
      return "Не удалось начать подключение. Попробуйте ещё раз.";
    }
    if (error.status === 409) {
      if (error.code === "payment_requires_review") {
        return "Нельзя отключить: есть платёж на ручной проверке. Сначала разберите его по runbook.";
      }
      return "Нельзя отключить: есть незавершённые платежи. Дождитесь их завершения и попробуйте снова.";
    }
    if (error.status === 502) {
      return "Платёжный сервис недоступен. Попробуйте ещё раз.";
    }
  }
  return action === "connect"
    ? "Не удалось начать подключение. Проверьте соединение и попробуйте снова."
    : "Не удалось отключить приём платежей. Проверьте соединение и попробуйте снова.";
}

const statusHeadline: Record<SellerPaymentAccount["status"], string> = {
  active: "Подключено",
  error: "Ошибка подключения",
  disabled: "Отключено",
};

function AccountSummary({ account }: { account: SellerPaymentAccount }) {
  return (
    <dl className="mt-4 flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">Статус</dt>
        <dd className="inline-flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-8 items-center gap-2 border-[3px] border-ink bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.16em]">
            <span
              aria-hidden="true"
              className={
                account.status === "active"
                  ? "size-2.5 bg-accent-green"
                  : account.status === "error"
                    ? "size-2.5 bg-accent-red"
                    : "size-2.5 bg-ink/40"
              }
            />
            {statusHeadline[account.status]}
          </span>
          {account.isTest ? (
            <span className="inline-flex min-h-8 items-center gap-2 border-[3px] border-ink bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.16em]">
              <span aria-hidden="true" className="size-2.5 bg-accent-orange" />
              Тестовый магазин
            </span>
          ) : null}
        </dd>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">Счёт ЮKassa</dt>
        <dd className="font-mono text-sm font-semibold">{account.providerAccountId}</dd>
      </div>
    </dl>
  );
}

/**
 * Seller payment account card: connect, disconnect and retry. The token never
 * reaches this component; the API returns a masked provider account id only.
 */
export function SellerPaymentsCard() {
  const queryClient = useQueryClient();
  const accountQuery = useSellerPaymentAccountQuery();
  const [actionError, setActionError] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: connectSellerPayments,
    onSuccess: ({ consentUrl }) => {
      setActionError(null);
      goToExternal(consentUrl);
    },
    onError: (error) => setActionError(paymentErrorMessage(error, "connect")),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectSellerPayments,
    onSuccess: (data) => {
      queryClient.setQueryData(sellerKeys.paymentsAccount, data);
      setActionError(null);
    },
    onError: (error) => setActionError(paymentErrorMessage(error, "disconnect")),
  });

  const account = accountQuery.data?.account ?? null;
  const busy = connectMutation.isPending || disconnectMutation.isPending;

  return (
    <Card as="section" aria-labelledby="payments-title">
      <h2 id="payments-title" className="font-mono text-[10px] uppercase tracking-[0.2em]">
        Приём платежей
      </h2>

      {accountQuery.isPending ? (
        <output aria-live="polite" className="mt-4 block text-sm">
          Загружаем приём платежей…
        </output>
      ) : null}

      {accountQuery.isError ? (
        <>
          <p className="mt-4 text-sm leading-relaxed">Не удалось загрузить приём платежей.</p>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => void accountQuery.refetch()}
          >
            Повторить
          </Button>
        </>
      ) : null}

      {accountQuery.isSuccess ? (
        <>
          {account === null ? (
            <>
              <p className="mt-4">
                <span className="inline-flex min-h-8 items-center gap-2 border-[3px] border-ink bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.16em]">
                  <span aria-hidden="true" className="size-2.5 bg-ink/40" />
                  Не подключено
                </span>
              </p>
              <p className="mt-4 text-sm leading-relaxed">
                Подключите ЮKassa, чтобы покупатели могли оплачивать заказы. Деньги поступают
                напрямую на ваш счёт.
              </p>
              <Button
                className="mt-4 w-full"
                onClick={() => connectMutation.mutate()}
                disabled={busy}
              >
                {connectMutation.isPending ? "Подключаем…" : "Подключить ЮKassa"}
              </Button>
            </>
          ) : (
            <>
              <AccountSummary account={account} />
              {account.status === "active" ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed">
                    Покупатели видят кнопку оплаты в заказе. Чтобы отключить приём, сначала
                    завершите активные платежи.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={busy}
                  >
                    {disconnectMutation.isPending ? "Отключаем…" : "Отключить приём платежей"}
                  </Button>
                </>
              ) : null}
              {account.status === "error" ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed">
                    Подключение не завершилось. Повторите попытку или проверьте доступ в кабинете
                    ЮKassa.
                  </p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => connectMutation.mutate()}
                    disabled={busy}
                  >
                    {connectMutation.isPending ? "Подключаем…" : "Повторить подключение"}
                  </Button>
                </>
              ) : null}
              {account.status === "disabled" ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed">
                    Приём платежей отключён. Покупатели не смогут оплатить новые заказы.
                  </p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => connectMutation.mutate()}
                    disabled={busy}
                  >
                    {connectMutation.isPending ? "Подключаем…" : "Подключить снова"}
                  </Button>
                </>
              ) : null}
            </>
          )}

          <FormError message={actionError} />
        </>
      ) : null}
    </Card>
  );
}
