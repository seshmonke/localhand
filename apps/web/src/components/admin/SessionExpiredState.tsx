import { Button } from "@localhand/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { authKeys, clearBuyerQueries, clearSellerQueries } from "../../lib/queries.js";
import { ScreenState } from "../ScreenState.js";

/**
 * 401 state for buyer and seller screens. Clears the cached session, seller
 * data and buyer orders before navigating so neither stale PII nor a stale
 * session can leak into the next login.
 */
export function SessionExpiredState({ next }: { next: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function openLogin() {
    setPending(true);
    try {
      await Promise.all([clearSellerQueries(queryClient), clearBuyerQueries(queryClient)]);
      queryClient.removeQueries({ queryKey: authKeys.me });
      navigate(`/login?next=${encodeURIComponent(next)}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <ScreenState
      kind="error"
      title={t("common.sessionExpired.title")}
      description={t("common.sessionExpired.description")}
      action={
        <Button type="button" onClick={() => void openLogin()} disabled={pending}>
          {pending ? t("common.sessionExpired.redirecting") : t("common.sessionExpired.login")}
        </Button>
      }
    />
  );
}
