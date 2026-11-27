import { formatRubles, kopecks, type CartItem } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { Trash2 } from "lucide-react";
import { Link } from "react-router";
import { useCart } from "../cart/CartContext.js";
import { pluralizeItems } from "../cart/item-count.js";
import { ScreenState } from "../components/ScreenState.js";

const tones = ["bg-accent-red", "bg-accent-orange", "bg-accent-green", "bg-ink"];

function CartItemRow({ item, onRemove }: { item: CartItem; onRemove: () => void }) {
  const tone = tones[item.productId % tones.length] ?? "bg-ink";

  return (
    <li className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 border-[3px] border-ink object-cover sm:size-20"
        />
      ) : (
        <div
          className={`size-16 shrink-0 border-[3px] border-ink sm:size-20 ${tone}`}
          aria-hidden="true"
        />
      )}

      <div className="min-w-0 flex-1">
        <Link
          to={`/products/${item.productId}`}
          className="break-words font-display text-sm uppercase leading-tight underline-offset-4 hover:underline sm:text-base"
        >
          {item.name}
        </Link>
        <p className="mt-1 font-mono text-xs sm:text-sm">
          {formatRubles(kopecks(item.priceKopecks))}
        </p>
      </div>

      <Button
        variant="ghost"
        size="md"
        className="h-11 w-11 shrink-0 px-0 sm:h-12 sm:w-auto sm:px-5"
        aria-label={`Удалить «${item.name}» из корзины`}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" className="size-5" />
        <span className="hidden sm:inline">Удалить</span>
      </Button>
    </li>
  );
}

export function CartPage() {
  const { items, count, groups, totalKopecks, isHydrated, removeItem, clear } = useCart();

  if (!isHydrated) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        <h1 className="sr-only">Корзина</h1>
        <ScreenState
          kind="loading"
          title="Загружаем корзину"
          description="Товары восстанавливаются с этого устройства."
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
        <h1 className="sr-only">Корзина</h1>
        <ScreenState
          kind="empty"
          title="Корзина пуста"
          description="Добавьте товары из каталога — корзина сохранится на этом устройстве."
          action={
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              Перейти в каталог
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-[3px] border-ink pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
            Корзина
          </p>
          <h1 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">Корзина</h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-wide">{pluralizeItems(count)}</p>
        </div>
        <Button variant="outline" onClick={clear}>
          Очистить корзину
        </Button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-6">
          {groups.map((group) => {
            const headingId = `cart-shop-${group.shopSlug}`;
            return (
              <section
                key={group.shopSlug}
                aria-labelledby={headingId}
                className="min-w-0 border-[3px] border-ink bg-paper"
              >
                <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b-[3px] border-ink p-4">
                  <h2 id={headingId} className="min-w-0 font-display text-xl uppercase">
                    <Link
                      to={`/shops/${group.shopSlug}`}
                      className="break-words underline-offset-4 hover:underline"
                    >
                      {group.shopName}
                    </Link>
                  </h2>
                  <p className="font-mono text-xs uppercase tracking-wide">
                    Итого: {formatRubles(kopecks(group.totalKopecks))}
                  </p>
                </header>
                <ul className="divide-y-[3px] divide-ink">
                  {group.items.map((item) => (
                    <CartItemRow
                      key={item.productId}
                      item={item}
                      onRemove={() => removeItem(item.productId)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <aside
          aria-labelledby="cart-total-title"
          className="border-[3px] border-ink bg-paper p-5 shadow-brutal-sm lg:sticky lg:top-28"
        >
          <h2 id="cart-total-title" className="font-display text-2xl uppercase">
            Итог
          </h2>
          <dl className="mt-4 space-y-2 font-mono text-xs uppercase tracking-wide">
            <div className="flex justify-between gap-4">
              <dt>Товаров</dt>
              <dd>{pluralizeItems(count)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t-[3px] border-ink pt-2 text-base">
              <dt>Итого</dt>
              <dd>{formatRubles(kopecks(totalKopecks))}</dd>
            </div>
          </dl>
          <Button size="lg" className="mt-5 w-full" disabled aria-describedby="checkout-hint">
            Оформить
          </Button>
          <p id="checkout-hint" className="mt-3 text-xs leading-relaxed">
            Оформление заказа станет доступно в следующем обновлении. Цену и наличие проверим перед
            оплатой.
          </p>
        </aside>
      </div>
    </div>
  );
}
