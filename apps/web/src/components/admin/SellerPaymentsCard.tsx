import type { SellerPaymentAccount } from "@localhand/shared";
import { Button } from "@localhand/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Translate = ReturnType<typeof useTranslation>["t"];
import { connectSellerPayments, disconnectSellerPayments } from "../../lib/api.js";
import { ApiError } from "../../lib/api.js";
import { goToExternal } from "../../lib/navigation.js";
import { sellerKeys, useSellerPaymentAccountQuery } from "../../lib/queries.js";
import { Card } from "../layout/index.js";
import { FormError } from "../FormField.js";

function paymentErrorMessage(
  error: unknown,
  action: "connect" | "disconnect",
  t: Translate,
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return t("common.sessionExpired.inline");
    }
    if (action === "connect") {
      if (error.status === 502) {
        return t("payment.error.providerUnavailable");
      }
      return t("admin.payment.error.connect");
    }
    if (error.status === 409) {
      if (error.code === "payment_requires_review") {
        return t("admin.payment.error.disconnectReview");
      }
      return t("admin.payment.error.disconnectPending");
    }
    if (error.status === 502) {
      return t("payment.error.providerUnavailable");
    }
  }
  return action === "connect"
    ? t("admin.payment.error.connectNetwork")
    : t("admin.payment.error.disconnectNetwork");
}

function statusHeadline(status: SellerPaymentAccount["status"], t: Translate): string {
  switch (status) {
    case "active":
      return t("admin.payment.status.active");
    case "error":
      return t("admin.payment.status.error");
    case "disabled":
      return t("admin.payment.status.disabled");
  }
}

function AccountSummary({ account }: { account: SellerPaymentAccount }) {
  const { t } = useTranslation();
  return (
    <dl className="mt-4 flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
          {t("admin.payment.statusLabel")}
        </dt>
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
            {statusHeadline(account.status, t)}
          </span>
          {account.isTest ? (
            <span className="inline-flex min-h-8 items-center gap-2 border-[3px] border-ink bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.16em]">
              <span aria-hidden="true" className="size-2.5 bg-accent-orange" />
              {t("admin.payment.testShop")}
            </span>
          ) : null}
        </dd>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/60">
          {t("admin.payment.account")}
        </dt>
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const accountQuery = useSellerPaymentAccountQuery();
  const [actionError, setActionError] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: connectSellerPayments,
    onSuccess: ({ consentUrl }) => {
      setActionError(null);
      goToExternal(consentUrl);
    },
    onError: (error) => setActionError(paymentErrorMessage(error, "connect", t)),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectSellerPayments,
    onSuccess: (data) => {
      queryClient.setQueryData(sellerKeys.paymentsAccount, data);
      setActionError(null);
    },
    onError: (error) => setActionError(paymentErrorMessage(error, "disconnect", t)),
  });

  const account = accountQuery.data?.account ?? null;
  const busy = connectMutation.isPending || disconnectMutation.isPending;

  return (
    <Card as="section" aria-labelledby="payments-title">
      <h2 id="payments-title" className="font-mono text-[10px] uppercase tracking-[0.2em]">
        {t("admin.payment.title")}
      </h2>

      {accountQuery.isPending ? (
        <output aria-live="polite" className="mt-4 block text-sm">
          {t("admin.payment.loading")}
        </output>
      ) : null}

      {accountQuery.isError ? (
        <>
          <p className="mt-4 text-sm leading-relaxed">{t("admin.payment.loadError")}</p>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => void accountQuery.refetch()}
          >
            {t("common.retry")}
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
                  {t("admin.payment.notConnected")}
                </span>
              </p>
              <p className="mt-4 text-sm leading-relaxed">
                {t("admin.payment.connectDescription")}
              </p>
              <Button
                className="mt-4 w-full"
                onClick={() => connectMutation.mutate()}
                disabled={busy}
              >
                {connectMutation.isPending
                  ? t("admin.payment.connecting")
                  : t("admin.payment.connect")}
              </Button>
            </>
          ) : (
            <>
              <AccountSummary account={account} />
              {account.status === "active" ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed">{t("admin.payment.activeHint")}</p>
                  <Button
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={busy}
                  >
                    {disconnectMutation.isPending
                      ? t("admin.payment.disconnecting")
                      : t("admin.payment.disconnect")}
                  </Button>
                </>
              ) : null}
              {account.status === "error" ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed">{t("admin.payment.errorHint")}</p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => connectMutation.mutate()}
                    disabled={busy}
                  >
                    {connectMutation.isPending
                      ? t("admin.payment.connecting")
                      : t("admin.payment.reconnect")}
                  </Button>
                </>
              ) : null}
              {account.status === "disabled" ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed">{t("admin.payment.disabledHint")}</p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => connectMutation.mutate()}
                    disabled={busy}
                  >
                    {connectMutation.isPending
                      ? t("admin.payment.connecting")
                      : t("admin.payment.reconnectShort")}
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
