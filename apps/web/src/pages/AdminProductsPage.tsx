import { buttonVariants } from "@localhand/ui";
import { Link } from "react-router";
import { ScreenState } from "../components/ScreenState.js";

export function AdminProductsPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red">
          Кабинет продавца
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase leading-none sm:text-4xl">Товары</h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed">
          Здесь появится список товаров, создание карточек и публикация на витрину.
        </p>
      </header>

      <div className="mt-6">
        <ScreenState
          kind="empty"
          title="Скоро"
          description="Управление товарами выйдет в следующем обновлении кабинета (S1-4b). Пока настройте магазин и опубликуйте его."
          action={
            <Link to="/admin/shop" className={buttonVariants({ variant: "outline" })}>
              К настройкам магазина
            </Link>
          }
        />
      </div>
    </div>
  );
}
