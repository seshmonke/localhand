import { cn } from "@localhand/ui";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
} as const;

const tones = {
  paper: "border-ink bg-paper text-ink",
  inverse: "border-ink bg-inverse text-inverse-text",
} as const;

type CardElement = "div" | "section" | "article" | "aside" | "form";

type CardOwnProps = {
  children: ReactNode;
  padding?: keyof typeof paddings;
  tone?: keyof typeof tones;
  shadow?: boolean;
  className?: string;
};

/**
 * The 3px brutalist card. Padding is 16/24/32, never 20: the card geometry is
 * part of the same 8pt scale as page rhythm. The polymorphic `as` keeps form
 * and section semantics while every page uses one border/padding recipe.
 */
export function Card<T extends CardElement = "div">({
  as,
  children,
  padding = "md",
  tone = "paper",
  shadow = false,
  className,
  ...props
}: CardOwnProps & { as?: T } & Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps | "as">) {
  const Component = (as ?? "div") as ElementType;

  return (
    <Component
      className={cn(
        "border-[3px]",
        tones[tone],
        paddings[padding],
        shadow ? "shadow-brutal-sm" : undefined,
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
