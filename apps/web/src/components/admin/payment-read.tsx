import type { OrderPayment, OrderStatus } from "@localhand/shared";
import { useTranslation } from "react-i18next";
import { PaymentStatusBadge } from "./PaymentStatusBadge.js";

/**
 * A payment read is a separate resource from the order. A failed read must not
 * be rendered as "no payment": the payment may exist and be paid, so the list
 * keeps the order-status fallback and offers an explicit retry.
 */
export type PaymentRead =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "ready"; payment: OrderPayment | null };

export function PaymentReadStatus({
  orderStatus,
  read,
  emptyLabel,
}: {
  orderStatus: OrderStatus;
  read: PaymentRead;
  emptyLabel: string;
}) {
  const { t } = useTranslation();

  if (read.kind === "loading") {
    return <span className="text-xs text-ink/60">{t("payment.read.loading")}</span>;
  }

  if (read.kind === "error") {
    return (
      <span className="flex flex-col gap-1">
        <span className="text-xs">{t("payment.read.error")}</span>
        <button
          type="button"
          className="self-start font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4"
          onClick={read.retry}
        >
          {t("common.retry")}
        </button>
      </span>
    );
  }

  if (read.payment) {
    return <PaymentStatusBadge status={read.payment.status} />;
  }

  // A paid order without a visible payment row still means the order is paid;
  // never show "payment not connected" for it.
  if (orderStatus === "paid") {
    return <span className="text-sm">{t("payment.status.succeeded")}</span>;
  }

  return <span className="text-sm">{emptyLabel}</span>;
}
