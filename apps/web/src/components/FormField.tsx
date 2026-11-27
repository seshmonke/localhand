import { cn } from "@localhand/ui";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export const fieldControlClass =
  "w-full min-h-12 border-[3px] border-ink bg-paper px-3 py-3 font-body text-base leading-snug text-ink placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink aria-invalid:border-accent-red aria-invalid:ring-2 aria-invalid:ring-accent-red/40 disabled:opacity-60";

type FormFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
};

export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.18em]">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-2 text-sm leading-relaxed text-ink/70">
          {hint}
        </p>
      ) : null}
      <div className={hint ? "mt-2" : "mt-3"}>{children}</div>
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-2 flex items-start gap-2 border-l-[3px] border-accent-red pl-2 text-sm font-semibold text-ink"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-red" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function fieldDescribedBy(
  id: string,
  hint?: string,
  error?: string | null,
): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(
    (value): value is string => value !== null,
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div role="alert" className="border-[3px] border-ink bg-accent-red/10 p-3">
      <p className="flex items-start gap-2 text-sm font-semibold text-ink">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-red" />
        {message}
      </p>
    </div>
  );
}

export function Announcer({ message }: { message: string }) {
  return (
    <output
      aria-live="polite"
      className={cn("block text-sm font-semibold", message ? "" : "sr-only")}
    >
      {message}
    </output>
  );
}
