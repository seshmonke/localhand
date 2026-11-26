import { buttonVariants } from "@localhand/ui";
import { Link } from "react-router";
import { ScreenState } from "../components/ScreenState.js";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
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
    </div>
  );
}
