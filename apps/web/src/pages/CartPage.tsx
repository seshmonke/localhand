import { formatRubles, kopecks, type CartItem } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { Trash2 } from "lucide-react";
import { Link } from "react-router";
import { useCart } from "../cart/CartContext.js";
import { pluralizeItems } from "../cart/item-count.js";
import { ScreenState } from "../components/ScreenState.js";
import {
  Card,
  Grid,
  GridColumn,
  PageHeader,
  PageShell,
  Sidebar,
  Stack,
} from "../components/layout/index.js";

const tones = ["bg-accent-red", "bg-accent-orange", "bg-accent-green", "bg-ink"];

function CartItemRow({ item, onRemove }: { item: CartItem; onRemove: () => void }) {
  const tone = tones[item.productId % tones.length] ?? "bg-ink";

  return (
    <li className="flex items-center gap-4 p-4">
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
        <p className="mt-2 font-mono text-xs sm:text-sm">
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
      <PageShell className="py-10 sm:py-12">
        <h1 className="sr-only">Корзина</h1>
        <ScreenState
          kind="loading"
          title="Загружаем корзину"
          description="Товары восстанавливаются с этого устройства."
        />
      </PageShell>
    );
  }

  if (items.length === 0) {
    return (
      <PageShell className="py-10 sm:py-12">
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
      </PageShell>
    );
  }

  return (
    <PageShell className="py-10 sm:py-12">
      <Stack gap={8}>
        <PageHeader
          eyebrow="Корзина"
          title="Корзина"
          description={pluralizeItems(count)}
          descriptionClassName="font-mono text-xs uppercase tracking-wide"
          actions={
            <Button variant="outline" onClick={clear}>
              Очистить корзину
            </Button>
          }
        />

        <Grid>
          <GridColumn span={8}>
            <Stack gap={6}>
              {groups.map((group) => {
                const headingId = `cart-shop-${group.shopSlug}`;
                return (
                  <Card
                    key={group.shopSlug}
                    as="section"
                    padding="none"
                    aria-labelledby={headingId}
                  >
                    <header className="flex min-w-0 flex-wrap items-center justify-between gap-4 border-b-[3px] border-ink p-4">
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
                  </Card>
                );
              })}
            </Stack>
          </GridColumn>

          <Sidebar sticky aria-labelledby="cart-total-title">
            <Card shadow>
              <h2 id="cart-total-title" className="font-display text-2xl uppercase">
                Итог
              </h2>
              <dl className="mt-4 flex flex-col gap-2 font-mono text-xs uppercase tracking-wide">
                <div className="flex justify-between gap-4">
                  <dt>Товаров</dt>
                  <dd>{pluralizeItems(count)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t-[3px] border-ink pt-2 text-base">
                  <dt>Итого</dt>
                  <dd>{formatRubles(kopecks(totalKopecks))}</dd>
                </div>
              </dl>
              <Link
                to="/checkout"
                className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}
              >
                Оформить
              </Link>
              <p className="mt-4 text-xs leading-relaxed">
                Войдите по телефону и проверьте состав — цену и наличие подтвердит продавец.
              </p>
            </Card>
          </Sidebar>
        </Grid>
      </Stack>
    </PageShell>
  );
}
