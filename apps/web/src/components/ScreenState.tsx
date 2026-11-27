import type { ReactNode } from "react";

type ScreenStateProps = {
  kind: "loading" | "empty" | "error";
  title: string;
  description?: string;
  action?: ReactNode;
};

const labels = {
  loading: "Загрузка",
  empty: "Пусто",
  error: "Ошибка",
} as const;

export function ScreenState({ kind, title, description, action }: ScreenStateProps) {
  return (
    <div className="border-[3px] border-ink bg-paper p-6 sm:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-orange-text">
        {labels[kind]}
      </p>
      <h2 className="mt-3 font-display text-2xl uppercase sm:text-3xl">{title}</h2>
      {description ? <p className="mt-3 max-w-xl text-sm leading-relaxed">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Загрузка товаров">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="border-[3px] border-ink bg-paper p-3">
          <div className="aspect-[4/5] border-[3px] border-ink bg-ink/10" />
          <div className="mt-3 h-4 w-2/3 bg-ink/20" />
          <div className="mt-2 h-3 w-1/2 bg-ink/10" />
        </div>
      ))}
    </div>
  );
}
