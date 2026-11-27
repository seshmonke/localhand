import { formatRubles, kopecks, type OrderSummary } from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useCart } from "../cart/CartContext.js";
import { pluralizeItems } from "../cart/item-count.js";
import {
  fieldControlClass,
  fieldDescribedBy,
  FormError,
  FormField,
} from "../components/FormField.js";
import { ScreenState } from "../components/ScreenState.js";
import { SessionExpiredState } from "../components/admin/SessionExpiredState.js";
import {
  Card,
  Grid,
  GridColumn,
  PageHeader,
  PageShell,
  Sidebar,
  Stack,
} from "../components/layout/index.js";
import {
  ApiError,
  checkout,
  fetchDeliveryCities,
  fetchDeliveryPoints,
  fetchDeliveryQuote,
} from "../lib/api.js";
import { orderKeys, useMeQuery } from "../lib/queries.js";

const COMMENT_MAX_LENGTH = 500;
export const COMMENT_HINT = "Необязательно. До 500 символов: удобное время, вопросы по вещи.";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) {
    return phone;
  }
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function checkoutErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return "Проверьте состав корзины: в заказе от 1 до 50 уникальных товаров.";
      case 429:
        return "Слишком много попыток оформления. Подождите минуту и попробуйте снова.";
      case 409:
        return "Некоторые товары больше недоступны. Проверьте корзину и попробуйте снова.";
      case 401:
        return "Сессия истекла. Войдите снова.";
      default:
        break;
    }
  }

  return "Не удалось оформить заказ. Проверьте соединение и попробуйте снова.";
}

function deliveryQuoteErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "delivery_dimensions_missing":
        return "У одного из товаров не указаны вес и габариты. Напишите продавцу.";
      case "shop_city_missing":
      case "shop_shipment_point_missing":
        return "Продавец ещё не настроил отправку из своего города.";
      case "delivery_point_invalid":
        return "Этот пункт выдачи не подходит для выбранного города.";
      case "delivery_unavailable":
        return "Доставка временно недоступна. Попробуйте позже.";
      default:
        break;
    }
  }
  return "Не удалось рассчитать доставку. Попробуйте другой пункт выдачи.";
}

export function CheckoutPage() {
  const { items, count, groups, totalKopecks, isHydrated, hasItem, removeItem } = useCart();
  const me = useMeQuery();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [createdOrders, setCreatedOrders] = useState<OrderSummary[] | null>(null);
  const [cityCode, setCityCode] = useState<number | null>(null);
  const [pointCode, setPointCode] = useState("");
  const [recipientName, setRecipientName] = useState("");

  const itemSignature = items.map((item) => item.productId).join(",");

  const citiesQuery = useQuery({
    queryKey: ["delivery", "cities"],
    queryFn: () => fetchDeliveryCities(""),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const pointsQuery = useQuery({
    queryKey: ["delivery", "points", cityCode],
    queryFn: () => fetchDeliveryPoints(cityCode as number),
    enabled: cityCode !== null,
    retry: false,
  });
  const quoteQuery = useQuery({
    queryKey: ["delivery", "quote", itemSignature, cityCode, pointCode],
    queryFn: () =>
      fetchDeliveryQuote({
        items: items.map((item) => ({ productId: item.productId })),
        cityCode: cityCode as number,
        pointCode,
      }),
    enabled: cityCode !== null && pointCode.length > 0,
    retry: false,
  });

  const deliveryKopecks =
    quoteQuery.data?.shops.reduce((sum, shop) => sum + shop.priceKopecks, 0) ?? 0;
  const deliveryPeriodMax = quoteQuery.data?.shops.reduce(
    (max, shop) => Math.max(max, shop.periodMax),
    0,
  );
  const deliveryReady = quoteQuery.data !== undefined;
  const deliveryStarted = cityCode !== null || pointCode.length > 0 || recipientName.length > 0;
  const checkoutIdRef = useRef<string>(crypto.randomUUID());
  const signatureRef = useRef(itemSignature);

  // The idempotency key changes only when the cart composition changes or a
  // checkout succeeds. A retry of the same composition keeps the same key.
  useEffect(() => {
    if (signatureRef.current === itemSignature) {
      return;
    }
    signatureRef.current = itemSignature;
    checkoutIdRef.current = crypto.randomUUID();
  }, [itemSignature]);

  const checkoutMutation = useMutation({
    mutationFn: checkout,
    onSuccess: (data) => {
      setCreatedOrders(data.orders);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          setSessionExpired(true);
          return;
        }
        if (error.status === 409 && error.code === "product_unavailable") {
          setUnavailable(true);
          setFormError(null);
          return;
        }
        if (error.status === 409 && error.code === "delivery_quote_stale") {
          setFormError("Цена доставки изменилась. Выберите ПВЗ заново.");
          void quoteQuery.refetch();
          return;
        }
        if (error.status === 502 && error.code === "delivery_unavailable") {
          setFormError("Доставка временно недоступна. Попробуйте позже.");
          return;
        }
      }
      setFormError(checkoutErrorMessage(error));
    },
  });

  // The API returns every order created for this idempotency key. Remove only
  // the products that are actually part of the returned orders; a replay may
  // contain fewer items than the current cart. One item per render keeps the
  // cart context callbacks fresh.
  useEffect(() => {
    if (!createdOrders) {
      return;
    }

    const orderedProductIds = new Set<number>();
    for (const order of createdOrders) {
      for (const item of order.items) {
        if (item.productId !== null) {
          orderedProductIds.add(item.productId);
        }
      }
    }

    const nextProductId = [...orderedProductIds].find((productId) => hasItem(productId));
    if (nextProductId !== undefined) {
      removeItem(nextProductId);
      return;
    }

    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    // One order: go straight to the order screen where the buyer can pay.
    // Multiple shops: the orders list explains that each order is paid
    // separately.
    const singleOrder = createdOrders.length === 1 ? createdOrders[0] : undefined;
    navigate(singleOrder ? `/orders/${singleOrder.id}` : "/orders", {
      replace: true,
      state: { checkoutDone: true },
    });
  }, [createdOrders, hasItem, removeItem, navigate, queryClient]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setUnavailable(false);

    if (deliveryStarted && !deliveryReady) {
      setFormError("Выберите город, пункт выдачи и укажите имя получателя.");
      return;
    }

    const trimmedComment = comment.trim();
    checkoutMutation.mutate({
      items: items.map((item) => ({ productId: item.productId })),
      ...(trimmedComment.length > 0 ? { comment: trimmedComment } : {}),
      ...(deliveryReady && cityCode !== null && quoteQuery.data
        ? {
            delivery: {
              cityCode,
              pointCode,
              recipientName: recipientName.trim(),
              quoteToken: quoteQuery.data.quoteToken,
            },
          }
        : {}),
      clientCheckoutId: checkoutIdRef.current,
    });
  }

  if (sessionExpired) {
    return (
      <PageShell className="py-10 sm:py-12">
        <h1 className="sr-only">Оформление заказа</h1>
        <SessionExpiredState next="/checkout" />
      </PageShell>
    );
  }

  if (!isHydrated) {
    return (
      <PageShell className="py-10 sm:py-12">
        <h1 className="sr-only">Оформление заказа</h1>
        <ScreenState
          kind="loading"
          title="Проверяем корзину"
          description="Восстанавливаем товары с этого устройства."
        />
      </PageShell>
    );
  }

  if (items.length === 0) {
    return (
      <PageShell className="py-10 sm:py-12">
        <h1 className="sr-only">Оформление заказа</h1>
        <ScreenState
          kind="empty"
          title="Корзина пуста"
          description="Добавьте товары из каталога, чтобы оформить заказ."
          action={
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              Перейти в каталог
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (createdOrders) {
    return (
      <PageShell className="py-10 sm:py-12">
        <h1 className="sr-only">Оформление заказа</h1>
        <ScreenState
          kind="loading"
          title="Заказ оформлен"
          description="Переходим к заказу и оплате."
        />
      </PageShell>
    );
  }

  const phone = me.data?.user.phone;
  const pending = checkoutMutation.isPending;

  return (
    <PageShell className="py-10 sm:py-12">
      <Stack gap={8}>
        <PageHeader
          eyebrow="Оформление заказа"
          title="Проверьте заказ"
          description="Заказ получит продавец каждого магазина. Цену и состав проверит сервер — оплата проходит на странице ЮKassa, деньги получает продавец."
        />

        <form noValidate onSubmit={handleSubmit}>
          <Grid>
            <GridColumn span={8}>
              <Stack gap={6}>
                {groups.map((group) => {
                  const headingId = `checkout-shop-${group.shopSlug}`;
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
                          <li
                            key={item.productId}
                            className="flex flex-wrap items-center justify-between gap-4 p-4"
                          >
                            <Link
                              to={`/products/${item.productId}`}
                              className="min-w-0 break-words font-display text-sm uppercase leading-tight underline-offset-4 hover:underline sm:text-base"
                            >
                              {item.name}
                            </Link>
                            <p className="font-mono text-xs sm:text-sm">
                              {formatRubles(kopecks(item.priceKopecks))}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}

                <Card as="section" aria-labelledby="checkout-delivery-title">
                  <h2 id="checkout-delivery-title" className="font-display text-2xl uppercase">
                    Доставка
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed">
                    Выберите город и пункт выдачи СДЭК. Стоимость и срок рассчитает сервер.
                  </p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <FormField id="checkout-city" label="Город доставки">
                      <select
                        id="checkout-city"
                        name="cityCode"
                        value={cityCode ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCityCode(value ? Number(value) : null);
                          setPointCode("");
                        }}
                        className={fieldControlClass}
                      >
                        <option value="">
                          {citiesQuery.isLoading ? "Загружаем города…" : "Выберите город"}
                        </option>
                        {citiesQuery.data?.cities.map((city) => (
                          <option key={city.code} value={city.code}>
                            {city.name}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField
                      id="checkout-point"
                      label="Пункт выдачи"
                      hint="Список ПВЗ выбранного города."
                    >
                      <select
                        id="checkout-point"
                        name="pointCode"
                        value={pointCode}
                        disabled={cityCode === null || pointsQuery.isLoading}
                        onChange={(event) => setPointCode(event.target.value)}
                        aria-describedby={fieldDescribedBy(
                          "checkout-point",
                          "Список ПВЗ выбранного города.",
                        )}
                        className={fieldControlClass}
                      >
                        <option value="">
                          {pointsQuery.isLoading ? "Загружаем ПВЗ…" : "Выберите ПВЗ"}
                        </option>
                        {pointsQuery.data?.points.map((point) => (
                          <option key={point.code} value={point.code}>
                            {point.name} — {point.address}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField
                      id="checkout-recipient"
                      label="Имя получателя"
                      hint="Имя, на которое оформлена посылка."
                    >
                      <input
                        id="checkout-recipient"
                        name="recipientName"
                        type="text"
                        autoComplete="name"
                        maxLength={100}
                        value={recipientName}
                        onChange={(event) => setRecipientName(event.target.value)}
                        aria-describedby={fieldDescribedBy(
                          "checkout-recipient",
                          "Имя, на которое оформлена посылка.",
                        )}
                        className={fieldControlClass}
                      />
                    </FormField>
                  </div>

                  {citiesQuery.isError ? (
                    <div role="alert" className="mt-4 border-[3px] border-ink p-4">
                      <p className="text-sm font-semibold">Не удалось загрузить города.</p>
                      <button
                        type="button"
                        onClick={() => void citiesQuery.refetch()}
                        className="mt-2 font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4"
                      >
                        Повторить
                      </button>
                    </div>
                  ) : null}

                  {pointsQuery.isError ? (
                    <div role="alert" className="mt-4 border-[3px] border-ink p-4">
                      <p className="text-sm font-semibold">Не удалось загрузить пункты выдачи.</p>
                      <button
                        type="button"
                        onClick={() => void pointsQuery.refetch()}
                        className="mt-2 font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4"
                      >
                        Повторить
                      </button>
                    </div>
                  ) : null}

                  {quoteQuery.isError ? (
                    <div role="alert" className="mt-4 border-[3px] border-ink p-4">
                      <p className="text-sm font-semibold">
                        {deliveryQuoteErrorMessage(quoteQuery.error)}
                      </p>
                    </div>
                  ) : null}

                  {quoteQuery.data ? (
                    <dl className="mt-4 flex flex-col gap-2 font-mono text-xs uppercase tracking-wide">
                      <div className="flex justify-between gap-4">
                        <dt>Доставка</dt>
                        <dd>{formatRubles(kopecks(deliveryKopecks))}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt>Срок</dt>
                        <dd>{deliveryPeriodMax} дн.</dd>
                      </div>
                    </dl>
                  ) : null}
                </Card>

                <Card as="section" aria-labelledby="checkout-contact-title">
                  <h2 id="checkout-contact-title" className="font-display text-2xl uppercase">
                    Контакты
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed">
                    Телефон для связи:{" "}
                    <strong className="whitespace-nowrap font-mono font-semibold">
                      {phone ? formatPhone(phone) : "—"}
                    </strong>
                    . Заказ привязан к номеру, на который вы вошли.
                  </p>

                  <div className="mt-6">
                    <FormField
                      id="checkout-comment"
                      label="Комментарий продавцу"
                      hint={COMMENT_HINT}
                    >
                      <textarea
                        id="checkout-comment"
                        name="comment"
                        rows={4}
                        maxLength={COMMENT_MAX_LENGTH}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        aria-describedby={fieldDescribedBy("checkout-comment", COMMENT_HINT)}
                        className={`${fieldControlClass} min-h-28 resize-y`}
                      />
                    </FormField>
                  </div>
                </Card>
              </Stack>
            </GridColumn>

            <Sidebar sticky aria-labelledby="checkout-total-title">
              <Card shadow>
                <h2 id="checkout-total-title" className="font-display text-2xl uppercase">
                  Итог
                </h2>
                <dl className="mt-4 flex flex-col gap-2 font-mono text-xs uppercase tracking-wide">
                  <div className="flex justify-between gap-4">
                    <dt>Товаров</dt>
                    <dd>{pluralizeItems(count)}</dd>
                  </div>
                  {deliveryReady ? (
                    <div className="flex justify-between gap-4">
                      <dt>Доставка</dt>
                      <dd>{formatRubles(kopecks(deliveryKopecks))}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4 border-t-[3px] border-ink pt-2 text-base">
                    <dt>Итого</dt>
                    <dd>{formatRubles(kopecks(totalKopecks + deliveryKopecks))}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-col gap-4" aria-live="polite">
                  {unavailable ? (
                    <div role="alert" className="border-[3px] border-ink bg-accent-orange/15 p-4">
                      <p className="text-sm font-semibold leading-relaxed">
                        Часть товаров стала недоступна. Корзина не изменилась — проверьте позиции и
                        попробуйте снова.
                      </p>
                      <Link
                        to="/cart"
                        className="mt-2 inline-flex min-h-11 items-center font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
                      >
                        Проверить корзину
                      </Link>
                    </div>
                  ) : null}
                  <FormError message={formError} />
                </div>

                <Button type="submit" size="lg" className="mt-6 w-full" disabled={pending}>
                  {pending ? "Оформляем…" : "Оформить заказ"}
                </Button>
                <p className="mt-2 text-xs leading-relaxed">
                  Нажимая кнопку, вы отправляете заявку продавцам. После оформления вы перейдёте к
                  оплате. Если продавец не подключил приём платежей, статус заказа покажет это.
                </p>
              </Card>
            </Sidebar>
          </Grid>
        </form>
      </Stack>
    </PageShell>
  );
}
