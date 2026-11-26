import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "./lib/cn.js";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 border-[3px] border-ink",
    "font-body text-base font-semibold leading-none",
    "transition-[transform,box-shadow,background-color,color] duration-150",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-orange",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-ink text-paper hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--color-ink)]",
        outline:
          "bg-paper text-ink hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--color-ink)]",
        ghost: "border-transparent bg-transparent text-ink hover:bg-ink hover:text-paper",
        accent:
          "bg-accent-red text-paper hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--color-ink)]",
      },
      size: {
        sm: "h-10 px-3 text-sm",
        md: "h-12 px-5",
        lg: "h-14 px-7 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <BaseButton className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
