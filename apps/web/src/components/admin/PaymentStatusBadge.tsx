import type { PaymentStatus } from "@localhand/shared";
import { cn } from "@localhand/ui";
import { useTranslation } from "react-i18next";

type Translate = ReturnType<typeof useTranslation>["t"];

function paymentStatusLabel(status: PaymentStatus, t: Translate): string {
  switch (status) {
    case "pending":
      return t("payment.status.pending");
    case "succeeded":
      return t("payment.status.succeeded");
    case "canceled":
      return t("payment.status.canceled");
    case "failed":
      return t("payment.status.failed");
    case "manual_review":
      return t("payment.status.manualReview");
  }
}

const statusDot: Record<PaymentStatus, string> = {
  pending: "bg-accent-orange",
  succeeded: "bg-accent-green",
  canceled: "bg-ink/40",
  failed: "bg-accent-red",
  manual_review: "bg-accent-red",
};

/**
 * Payment status is its own badge: `manual_review` never becomes an order
 * status, and the seller list shows both side by side.
 */
export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-2 border-[3px] border-ink bg-paper px-3 font-mono text-[10px] uppercase tracking-[0.18em]",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2.5", statusDot[status])} />
      {paymentStatusLabel(status, t)}
    </span>
  );
}
