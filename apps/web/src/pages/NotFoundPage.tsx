import { buttonVariants } from "@localhand/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ScreenState } from "../components/ScreenState.js";
import { PageShell } from "../components/layout/index.js";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <PageShell className="py-10 sm:py-12">
      <ScreenState
        kind="empty"
        title={t("common.notFound.title")}
        description={t("common.notFound.description")}
        action={
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            {t("common.notFound.action")}
          </Link>
        }
      />
    </PageShell>
  );
}
