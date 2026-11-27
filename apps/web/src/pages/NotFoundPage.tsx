import { buttonVariants } from "@localhand/ui";
import { Link } from "react-router";
import { ScreenState } from "../components/ScreenState.js";
import { PageShell } from "../components/layout/index.js";

export function NotFoundPage() {
  return (
    <PageShell className="py-10 sm:py-12">
      <ScreenState
        kind="empty"
        title="Страница не найдена"
        description="Такой страницы нет. Вернитесь в каталог и начните оттуда."
        action={
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            В каталог
          </Link>
        }
      />
    </PageShell>
  );
}
