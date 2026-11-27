import { cn } from "@localhand/ui";
import type { ReactNode } from "react";

const widths = {
  page: "max-w-page",
  admin: "max-w-admin",
} as const;

export type PageShellSize = keyof typeof widths;

type PageShellProps = {
  children: ReactNode;
  /** Storefront pages use 1440, the seller cabinet uses a single 1200 width. */
  size?: PageShellSize;
  className?: string;
};

/**
 * One container for every page: the 1440 storefront shell and the 1200 admin
 * content shell differ only by `size`, never by local margins. Horizontal
 * padding is the same 16/24/40 step on both sides of every breakpoint.
 */
export function PageShell({ children, size = "page", className }: PageShellProps) {
  return (
    <div
      data-page-shell=""
      className={cn(
        "mx-auto flex min-h-full w-full flex-col px-4 sm:px-6 lg:px-10",
        widths[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
