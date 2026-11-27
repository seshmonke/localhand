import { Button } from "@localhand/ui";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ApiError } from "../../lib/api.js";
import { clearSellerQueries, useMeQuery } from "../../lib/queries.js";

function GuardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10 text-ink">
      <div className="w-full max-w-md border-[3px] border-ink bg-paper p-6 shadow-brutal-sm sm:p-8">
        {children}
      </div>
    </div>
  );
}

function UnauthorizedRedirect({ next }: { next: string }) {
  const queryClient = useQueryClient();
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    let active = true;
    void clearSellerQueries(queryClient).finally(() => {
      if (active) {
        setCleared(true);
      }
    });
    return () => {
      active = false;
    };
  }, [queryClient]);

  if (!cleared) {
    return (
      <GuardFrame>
        <output aria-live="polite" className="block font-mono text-xs uppercase tracking-[0.2em]">
          Проверяем сессию…
        </output>
      </GuardFrame>
    );
  }

  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
}

export function AdminGuard() {
  const me = useMeQuery();
  const location = useLocation();

  if (me.isPending) {
    return (
      <GuardFrame>
        <output aria-live="polite" className="block font-mono text-xs uppercase tracking-[0.2em]">
          Проверяем сессию…
        </output>
        <div aria-hidden="true" className="mt-6 space-y-3">
          <div className="h-3 w-2/3 bg-ink/20" />
          <div className="h-3 w-1/2 bg-ink/10" />
        </div>
      </GuardFrame>
    );
  }

  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      const next = `${location.pathname}${location.search}${location.hash}`;
      return <UnauthorizedRedirect next={next} />;
    }

    return (
      <GuardFrame>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-red-text">
          Ошибка
        </p>
        <h1 className="mt-3 font-display text-2xl uppercase leading-tight">
          Не удалось проверить сессию
        </h1>
        <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-red" />
          Проверьте соединение и попробуйте снова.
        </p>
        <Button className="mt-6" onClick={() => void me.refetch()}>
          Повторить
        </Button>
      </GuardFrame>
    );
  }

  return <Outlet />;
}
