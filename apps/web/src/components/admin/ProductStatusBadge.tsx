import type { ProductStatus } from "@localhand/shared";
import { cn } from "@localhand/ui";

export const productStatusMeta = {
  draft: {
    label: "Черновик",
    dot: "bg-accent-orange",
    description: "Черновик виден только вам. Опубликуйте товар, чтобы он появился на витрине.",
  },
  published: {
    label: "Опубликован",
    dot: "bg-accent-green",
    description: "Товар виден покупателям на витрине магазина.",
  },
  hidden: {
    label: "Скрыт",
    dot: "bg-accent-red",
    description: "Товар скрыт с витрины, но остаётся в кабинете.",
  },
} as const;

export function ProductStatusBadge({
  status,
  className,
}: {
  status: ProductStatus;
  className?: string;
}) {
  const meta = productStatusMeta[status];

  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 border-[3px] border-ink bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.12em]",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2.5 shrink-0", meta.dot)} />
      {meta.label}
    </span>
  );
}
