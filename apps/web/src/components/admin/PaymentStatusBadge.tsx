import type { PaymentStatus } from "@localhand/shared";
import { cn } from "@localhand/ui";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Ожидает оплаты",
  succeeded: "Оплачен",
  canceled: "Оплата отменена",
  failed: "Оплата не прошла",
  manual_review: "Требует проверки",
};

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
  return (
    <span
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-2 border-[3px] border-ink bg-paper px-3 font-mono text-[10px] uppercase tracking-[0.18em]",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2.5", statusDot[status])} />
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
