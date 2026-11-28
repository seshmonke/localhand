import { useTranslation } from "react-i18next";

type Translate = ReturnType<typeof useTranslation>["t"];
import type { ReactNode } from "react";

type ScreenStateProps = {
  kind: "loading" | "empty" | "error";
  title: string;
  description?: string;
  action?: ReactNode;
};

function stateLabel(kind: ScreenStateProps["kind"], t: Translate): string {
  switch (kind) {
    case "loading":
      return t("common.state.loading");
    case "empty":
      return t("common.state.empty");
    case "error":
      return t("common.state.error");
  }
}

export function ScreenState({ kind, title, description, action }: ScreenStateProps) {
  const { t } = useTranslation();
  const content = (
    <>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-orange-text">
        {stateLabel(kind, t)}
      </p>
      <h2 className="mt-3 font-display text-2xl uppercase sm:text-3xl">{title}</h2>
      {description ? <p className="mt-3 max-w-xl text-sm leading-relaxed">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </>
  );

  if (kind === "loading") {
    return (
      <output aria-live="polite" className="block border-[3px] border-ink bg-paper p-6 sm:p-8">
        {content}
      </output>
    );
  }

  return (
    <div
      role={kind === "error" ? "alert" : undefined}
      className="border-[3px] border-ink bg-paper p-6 sm:p-8"
    >
      {content}
    </div>
  );
}

export function ProductGridSkeleton() {
  const { t } = useTranslation();
  return (
    <output
      aria-live="polite"
      aria-busy="true"
      className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4"
    >
      <span className="sr-only">{t("common.state.loadingProducts")}</span>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex h-full flex-col border-[3px] border-ink bg-paper">
          <div className="aspect-[4/5] w-full bg-ink/10" />
          <div className="flex grow flex-col gap-2 px-4 pt-4">
            <div className="h-10 w-2/3 bg-ink/20 sm:h-4" />
            <div className="h-3 w-1/2 bg-ink/10" />
            <div className="h-3 w-1/3 bg-ink/10 sm:hidden" />
          </div>
          <div className="px-4 pb-4 pt-4">
            <div className="h-11 w-full bg-ink/20" />
          </div>
        </div>
      ))}
    </output>
  );
}
