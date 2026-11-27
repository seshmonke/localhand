import { cn } from "@localhand/ui";
import type { ReactNode } from "react";

/**
 * Vertical rhythm on the 8pt scale. Use gap between blocks instead of
 * `mt-*`: 8 / 16 / 24 / 32 / 40 / 48.
 */
const gapClasses = {
  2: "gap-2",
  4: "gap-4",
  6: "gap-6",
  8: "gap-8",
  10: "gap-10",
  12: "gap-12",
} as const;

export type StackGap = keyof typeof gapClasses;

type StackProps = {
  children: ReactNode;
  gap?: StackGap;
  className?: string;
};

export function Stack({ children, gap = 6, className }: StackProps) {
  return <div className={cn("flex flex-col", gapClasses[gap], className)}>{children}</div>;
}
