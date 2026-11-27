import { Button } from "@localhand/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { authKeys, clearSellerQueries } from "../../lib/queries.js";
import { ScreenState } from "../ScreenState.js";

/**
 * 401 state for seller screens. Clears the cached session and seller data
 * before navigating so the login page does not redirect back using a stale
 * `me` query.
 */
export function SessionExpiredState({ next }: { next: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function openLogin() {
    setPending(true);
    try {
      await clearSellerQueries(queryClient);
      queryClient.removeQueries({ queryKey: authKeys.me });
      navigate(`/login?next=${encodeURIComponent(next)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenState
      kind="error"
      title="Сессия истекла"
      description="Войдите снова, чтобы открыть кабинет."
      action={
        <Button type="button" onClick={() => void openLogin()} disabled={pending}>
          {pending ? "Переходим…" : "Войти"}
        </Button>
      }
    />
  );
}
