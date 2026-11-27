import { cn } from "@localhand/ui";
import type { ReactNode } from "react";

const titleSizes = {
  page: "text-4xl sm:text-5xl",
  admin: "text-3xl sm:text-4xl",
} as const;

export type PageHeaderSize = keyof typeof titleSizes;

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: PageHeaderSize;
  titleId?: string;
  descriptionClassName?: string;
  className?: string;
};

/**
 * The page heading block shared by storefront and admin: eyebrow, title,
 * optional description and right-aligned actions on one bottom border. The
 * left edge matches the page shell by construction, not by local margins.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  size = "page",
  titleId,
  descriptionClassName,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("border-b-[3px] border-ink pb-6", className)}>
      {eyebrow ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
          {eyebrow}
        </p>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-4",
          eyebrow ? "mt-2" : undefined,
        )}
      >
        <h1 id={titleId} className={cn("font-display uppercase leading-none", titleSizes[size])}>
          {title}
        </h1>
        {actions ? <div className="flex flex-wrap items-center gap-4">{actions}</div> : null}
      </div>

      {description ? (
        <div
          className={cn("mt-4 max-w-2xl text-pretty text-sm leading-relaxed", descriptionClassName)}
        >
          {description}
        </div>
      ) : null}
    </header>
  );
}
