import { Button, buttonVariants } from "@localhand/ui";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card, PageShell, Stack } from "../components/layout/index.js";
import { ApiError, completeSellerPaymentConnection } from "../lib/api.js";

/**
 * Dev-only fake OAuth consent page. The fake provider sends the seller here
 * with a signed state; confirming exchanges a one-time fake code through the
 * real callback route, so the UI exercises the production connect flow.
 */
export function DevPaymentsConnectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const state = searchParams.get("state") ?? "";
  const [code] = useState(() => `fake-code-${crypto.randomUUID()}`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await completeSellerPaymentConnection(code, state);
      navigate("/admin/shop", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 401) {
          setError("Сессия истекла. Войдите снова, чтобы подключить приём платежей.");
        } else if (caught.status === 400 || caught.status === 403) {
          setError("Ссылка устарела — начните подключение заново из кабинета.");
        } else {
          setError("Не удалось подключить приём платежей. Вернитесь в кабинет и попробуйте снова.");
        }
      } else {
        setError("Не удалось подключить приём платежей. Проверьте соединение и попробуйте снова.");
      }
      setPending(false);
    }
  }

  return (
    <PageShell size="admin" className="items-center justify-center py-10 sm:py-16">
      <Stack gap={4} className="w-full max-w-xl">
        <Card as="section" aria-labelledby="dev-connect-title">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/60">
            Тестовый режим (fake)
          </p>
          <h1 id="dev-connect-title" className="mt-2 font-display text-3xl uppercase leading-tight">
            Подключение ЮKassa
          </h1>
          <p className="mt-4 text-sm leading-relaxed">
            Это страница тестового провайдера. Реальная ЮKassa здесь не участвует, ключи и деньги не
            используются.
          </p>

          {state.length === 0 ? (
            <p
              role="alert"
              className="mt-4 border-[3px] border-ink bg-accent-orange/15 p-3 text-sm"
            >
              Нет параметра state. Начните подключение заново из кабинета.
            </p>
          ) : null}

          {error ? (
            <div role="alert" className="mt-4 border-[3px] border-ink bg-accent-orange/15 p-3">
              <p className="text-sm font-semibold leading-relaxed">{error}</p>
            </div>
          ) : null}

          <Button
            className="mt-6 w-full"
            onClick={() => void confirm()}
            disabled={pending || state.length === 0}
          >
            {pending ? "Подключаем…" : "Подтвердить подключение"}
          </Button>

          <Link
            to="/admin/shop"
            className={buttonVariants({ variant: "outline", className: "mt-3 w-full" })}
          >
            Вернуться в кабинет
          </Link>
        </Card>
      </Stack>
    </PageShell>
  );
}
