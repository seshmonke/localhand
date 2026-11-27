import { cn } from "@localhand/ui";
import type { ReactNode } from "react";

/**
 * Page-level grid: 4 columns on mobile, 8 on tablet, 12 on desktop. Gutter is
 * 16 px until `lg`, then 24 px. Component internals stay flex/stack.
 */
export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-x-4 gap-y-6 md:grid-cols-8 lg:grid-cols-12 lg:gap-x-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

const columnSpans = {
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
} as const;

export type GridColumnSpan = keyof typeof columnSpans;

export function GridColumn({
  children,
  span = 8,
  className,
}: {
  children: ReactNode;
  span?: GridColumnSpan;
  className?: string;
}) {
  return (
    <div className={cn("col-span-4 min-w-0 md:col-span-8", columnSpans[span], className)}>
      {children}
    </div>
  );
}

export function Sidebar({
  children,
  sticky = false,
  className,
  "aria-labelledby": labelledBy,
}: {
  children: ReactNode;
  sticky?: boolean;
  className?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <aside
      aria-labelledby={labelledBy}
      className={cn(
        "col-span-4 min-w-0 md:col-span-8 lg:col-span-4",
        sticky ? "lg:sticky lg:top-28" : undefined,
        className,
      )}
    >
      {children}
    </aside>
  );
}
