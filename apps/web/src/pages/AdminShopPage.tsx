import { isValidShopSlug, type SellerShop, type UpdateShop } from "@localhand/shared";
import { Button, cn } from "@localhand/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  Announcer,
  fieldControlClass,
  fieldDescribedBy,
  FormError,
  FormField,
} from "../components/FormField.js";
import { ScreenState } from "../components/ScreenState.js";
import { SellerPaymentsCard } from "../components/admin/SellerPaymentsCard.js";
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
  createShop,
  fetchDeliveryCities,
  fetchDeliveryPoints,
  updateShop,
} from "../lib/api.js";
import { sellerKeys, useSellerShopQuery } from "../lib/queries.js";

const SLUG_RULES = "Латиница в нижнем регистре, цифры и дефис, 3–40 символов; без дефиса по краям.";

type FieldErrors = {
  name?: string;
  slug?: string;
  description?: string;
};

type ShopFormProps = {
  onAnnounce: (message: string) => void;
};

const statusMeta = {
  draft: {
    label: "Черновик",
    dot: "bg-accent-orange",
    description: "Магазин не виден покупателям. Опубликуйте его, чтобы открыть витрину.",
  },
  published: {
    label: "Опубликован",
    dot: "bg-accent-green",
    description: "Магазин виден покупателям и доступен по публичной ссылке.",
  },
  blocked: {
    label: "Заблокирован",
    dot: "bg-accent-red",
    description: "Платформа заблокировала магазин: правки и публикация недоступны.",
  },
} as const;

function ShopStatusBadge({ status }: { status: SellerShop["status"] }) {
  const meta = statusMeta[status];
  return (
    <span className="inline-flex min-h-9 items-center gap-2 border-[3px] border-ink bg-paper px-3 font-mono text-[10px] uppercase tracking-[0.18em]">
      <span aria-hidden="true" className={cn("size-2.5", meta.dot)} />
      {meta.label}
    </span>
  );
}

function shopErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "slug_taken":
        return "Этот slug уже занят. Выберите другой.";
      case "shop_exists":
        return "У вас уже есть магазин. Обновите страницу, чтобы открыть настройки.";
      case "shop_blocked":
        return "Магазин заблокирован платформой: правки и публикация недоступны.";
      case "invalid_request":
        return "Проверьте поля: название до 80 символов, slug 3–40, описание до 2000.";
      case "unauthorized":
        return "Сессия истекла. Войдите снова.";
      case "not_found":
        return "Магазин не найден. Обновите страницу.";
      case "rate_limited":
        return "Слишком много запросов. Подождите минуту.";
      default:
        return "Не удалось сохранить изменения. Попробуйте ещё раз.";
    }
  }

  return "Не удалось сохранить изменения. Проверьте соединение и попробуйте снова.";
}

const DELIVERY_SAVE_ERRORS: Record<string, string> = {
  invalid_request: "Проверьте город и ПВЗ: сервер не принял данные доставки.",
  rate_limited: "Слишком много запросов. Подождите минуту и повторите.",
  delivery_unavailable: "Сервис доставки временно недоступен. Повторите попытку.",
};

function deliveryLookupErrorMessage(error: unknown, subject: "города" | "ПВЗ"): string {
  if (error instanceof ApiError) {
    if (error.status === 429 || error.code === "rate_limited") {
      return "Слишком много запросов. Подождите минуту и повторите.";
    }
    if (error.status === 502 || error.code === "delivery_unavailable") {
      return "Сервис доставки временно недоступен. Повторите попытку.";
    }
  }

  return `Не удалось загрузить ${subject}. Проверьте соединение и повторите попытку.`;
}

export function AdminShopPage() {
  const shopQuery = useSellerShopQuery();
  const [announcement, setAnnouncement] = useState("");
  const shop = shopQuery.data?.shop ?? null;

  return (
    <PageShell size="admin">
      <Stack gap={6}>
        <PageHeader
          size="admin"
          eyebrow="Кабинет продавца"
          title="Ваш магазин"
          description={
            shop
              ? "Обновите данные, опубликуйте магазин и проверьте, как он выглядит на витрине."
              : "Один магазин на продавца. Заполните три поля, чтобы открыть витрину."
          }
          actions={shop ? <ShopStatusBadge status={shop.status} /> : undefined}
        />

        <Announcer message={announcement} />

        <div>
          {shopQuery.isPending ? (
            <ScreenState
              kind="loading"
              title="Загружаем магазин"
              description="Секунду — проверяем данные кабинета."
            />
          ) : null}

          {shopQuery.isError ? (
            <ShopLoadError error={shopQuery.error} onRetry={() => void shopQuery.refetch()} />
          ) : null}

          {shopQuery.isSuccess ? (
            shop ? (
              <ShopSettings key={shop.id} shop={shop} onAnnounce={setAnnouncement} />
            ) : (
              <ShopOnboarding onAnnounce={setAnnouncement} />
            )
          ) : null}
        </div>
      </Stack>
    </PageShell>
  );
}

function ShopLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 401) {
    return <SessionExpiredState next="/admin/shop" />;
  }

  return (
    <ScreenState
      kind="error"
      title="Магазин не загрузился"
      description="Проверьте соединение и попробуйте снова."
      action={<Button onClick={onRetry}>Повторить</Button>}
    />
  );
}

function ShopOnboarding({ onAnnounce }: ShopFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createShop,
    onSuccess: (data) => {
      queryClient.setQueryData(sellerKeys.shop, data);
      onAnnounce("Магазин создан. Проверьте настройки и опубликуйте его.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "slug_taken") {
        setErrors((current) => ({ ...current, slug: shopErrorMessage(error) }));
        return;
      }
      setFormError(shopErrorMessage(error));
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    const nextErrors: FieldErrors = {};

    if (trimmedName.length === 0) {
      nextErrors.name = "Введите название магазина.";
    } else if (trimmedName.length > 80) {
      nextErrors.name = "Название — до 80 символов.";
    }

    if (!isValidShopSlug(trimmedSlug)) {
      nextErrors.slug = SLUG_RULES;
    }

    if (description.length > 2000) {
      nextErrors.description = "Описание — до 2000 символов.";
    }

    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    createMutation.mutate({
      name: trimmedName,
      slug: trimmedSlug,
      ...(description.trim().length > 0 ? { description: description.trim() } : {}),
    });
  }

  return (
    <Grid>
      <GridColumn span={8}>
        <Card as="form" noValidate onSubmit={handleSubmit} aria-labelledby="onboarding-title">
          <h2 id="onboarding-title" className="font-display text-2xl uppercase">
            Создать магазин
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Название и адрес витрины можно изменить позже.
          </p>

          <Stack gap={6} className="mt-6">
            <FormField
              id="shop-name"
              label="Название"
              hint="Так магазин увидят покупатели. До 80 символов."
              error={errors.name}
            >
              <input
                id="shop-name"
                name="name"
                type="text"
                autoComplete="organization"
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (errors.name) {
                    setErrors((current) => ({ ...current, name: undefined }));
                  }
                }}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={fieldDescribedBy(
                  "shop-name",
                  "Так магазин увидят покупатели. До 80 символов.",
                  errors.name,
                )}
                className={fieldControlClass}
              />
            </FormField>

            <FormField
              id="shop-slug"
              label="Slug"
              hint={`Адрес витрины: /shops/your-shop. ${SLUG_RULES}`}
              error={errors.slug}
            >
              <input
                id="shop-slug"
                name="slug"
                type="text"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value.toLowerCase());
                  if (errors.slug) {
                    setErrors((current) => ({ ...current, slug: undefined }));
                  }
                }}
                aria-invalid={errors.slug ? true : undefined}
                aria-describedby={fieldDescribedBy(
                  "shop-slug",
                  `Адрес витрины: /shops/your-shop. ${SLUG_RULES}`,
                  errors.slug,
                )}
                className={cn(fieldControlClass, "font-mono")}
              />
            </FormField>

            <FormField
              id="shop-description"
              label="Описание"
              hint="Необязательно. До 2000 символов."
              error={errors.description}
            >
              <textarea
                id="shop-description"
                name="description"
                rows={4}
                maxLength={2000}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  if (errors.description) {
                    setErrors((current) => ({ ...current, description: undefined }));
                  }
                }}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={fieldDescribedBy(
                  "shop-description",
                  "Необязательно. До 2000 символов.",
                  errors.description,
                )}
                className={cn(fieldControlClass, "min-h-32 resize-y")}
              />
            </FormField>

            <FormError message={formError} />

            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Создаём…" : "Создать магазин"}
            </Button>
          </Stack>
        </Card>
      </GridColumn>

      <Sidebar>
        <Card tone="inverse">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-orange">
            Как это работает
          </p>
          <ol className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-inverse-text/85">
            <li className="flex gap-4">
              <span aria-hidden="true" className="font-mono text-accent-green">
                01
              </span>
              Заполните название и slug — это адрес витрины.
            </li>
            <li className="flex gap-4">
              <span aria-hidden="true" className="font-mono text-accent-green">
                02
              </span>
              Добавьте описание: что продаёте и чем отличаетесь.
            </li>
            <li className="flex gap-4">
              <span aria-hidden="true" className="font-mono text-accent-green">
                03
              </span>
              Опубликуйте магазин — и он появится на витрине.
            </li>
          </ol>
          <p className="mt-6 border-t-[3px] border-inverse-text/30 pt-4 font-mono text-[10px] uppercase leading-relaxed tracking-wide text-inverse-text/60">
            Slug закрепляется за магазином в публичной ссылке
          </p>
        </Card>
      </Sidebar>
    </Grid>
  );
}

function ShopSettings({ shop, onAnnounce }: ShopFormProps & { shop: SellerShop }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(shop.name);
  const [slug, setSlug] = useState(shop.slug);
  const [description, setDescription] = useState(shop.description ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: UpdateShop) => updateShop(input),
    onSuccess: (data) => {
      queryClient.setQueryData(sellerKeys.shop, data);
      if (data.shop) {
        setName(data.shop.name);
        setSlug(data.shop.slug);
        setDescription(data.shop.description ?? "");
      }
      onAnnounce("Изменения сохранены.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "slug_taken") {
        setErrors((current) => ({ ...current, slug: shopErrorMessage(error) }));
        return;
      }
      setFormError(shopErrorMessage(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: "draft" | "published") => updateShop({ status }),
    onSuccess: (data, status) => {
      queryClient.setQueryData(sellerKeys.shop, data);
      setStatusError(null);
      onAnnounce(status === "published" ? "Магазин опубликован." : "Магазин снят с публикации.");
    },
    onError: (error) => {
      setStatusError(shopErrorMessage(error));
    },
  });

  const [cityQuery, setCityQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<{ code: number; name: string } | null>(
    shop.cdekCityCode !== null && shop.cdekCityName !== null
      ? { code: shop.cdekCityCode, name: shop.cdekCityName }
      : null,
  );
  const [pointCode, setPointCode] = useState(shop.cdekShipmentPoint ?? "");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [pointInvalid, setPointInvalid] = useState(false);

  const normalizedCityQuery = cityQuery.trim();
  const [debouncedCityQuery, setDebouncedCityQuery] = useState("");

  useEffect(() => {
    const enabled = normalizedCityQuery.length >= 2;
    const timer = setTimeout(
      () => setDebouncedCityQuery(enabled ? normalizedCityQuery : ""),
      enabled ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [normalizedCityQuery]);

  const citiesQuery = useQuery({
    queryKey: ["admin-delivery", "cities", debouncedCityQuery],
    queryFn: () => fetchDeliveryCities(debouncedCityQuery),
    enabled: debouncedCityQuery.length >= 2,
    retry: false,
  });
  const pointsQuery = useQuery({
    queryKey: ["admin-delivery", "points", selectedCity?.code ?? null],
    queryFn: () => {
      if (selectedCity === null) {
        throw new Error("delivery origin city is required");
      }
      return fetchDeliveryPoints(selectedCity.code);
    },
    enabled: selectedCity !== null,
    retry: false,
  });

  const cityResults = citiesQuery.data?.cities ?? [];
  const points = pointsQuery.data?.points ?? [];
  const selectedCityMissing =
    selectedCity !== null && !cityResults.some((city) => city.code === selectedCity.code);
  const savedPointFallback =
    selectedCity !== null &&
    selectedCity.code === shop.cdekCityCode &&
    pointCode.length > 0 &&
    (pointsQuery.isPending || pointsQuery.isError);
  const savedPointUnavailable =
    selectedCity !== null &&
    selectedCity.code === shop.cdekCityCode &&
    pointCode.length > 0 &&
    pointsQuery.isSuccess &&
    !points.some((point) => point.code === pointCode);
  const effectivePointCode = savedPointUnavailable ? "" : pointCode;
  const nextPoint =
    selectedCity === null || effectivePointCode.length === 0 ? null : effectivePointCode;
  const deliveryDirty =
    (selectedCity?.code ?? null) !== shop.cdekCityCode ||
    (selectedCity?.name ?? null) !== shop.cdekCityName ||
    nextPoint !== shop.cdekShipmentPoint;
  const cityStatus =
    normalizedCityQuery.length < 2
      ? "Начните вводить город: минимум два символа."
      : citiesQuery.isPending
        ? "Ищем города…"
        : citiesQuery.isError
          ? ""
          : cityResults.length === 0
            ? "Города не найдены. Уточните запрос."
            : `Найдено городов: ${cityResults.length}. Выберите город в списке.`;
  const pointsStatus = pointsQuery.isPending
    ? "Загружаем ПВЗ…"
    : pointsQuery.isError
      ? ""
      : points.length === 0
        ? "В этом городе нет ПВЗ. Выберите другой город."
        : `Доступно ПВЗ: ${points.length}.`;

  const deliveryMutation = useMutation({
    mutationFn: (input: UpdateShop) => updateShop(input),
    onSuccess: (data) => {
      queryClient.setQueryData(sellerKeys.shop, data);
      if (data.shop) {
        setSelectedCity(
          data.shop.cdekCityCode !== null && data.shop.cdekCityName !== null
            ? { code: data.shop.cdekCityCode, name: data.shop.cdekCityName }
            : null,
        );
        setPointCode(data.shop.cdekShipmentPoint ?? "");
      }
      setDeliveryError(null);
      onAnnounce("Доставка сохранена.");
    },
    onError: (error) => {
      setDeliveryError(
        (error instanceof ApiError && DELIVERY_SAVE_ERRORS[error.code]) ||
          "Не удалось сохранить доставку. Проверьте соединение и повторите попытку.",
      );
    },
  });

  function handleSaveDelivery() {
    setDeliveryError(null);
    setPointInvalid(false);

    if (selectedCity !== null && effectivePointCode.length === 0) {
      setDeliveryError("Выберите ПВЗ: без него заказы не смогут оформить доставку.");
      setPointInvalid(true);
      document.getElementById("shop-delivery-point")?.focus();
      return;
    }

    deliveryMutation.mutate(
      selectedCity !== null
        ? {
            cdekCityCode: selectedCity.code,
            cdekCityName: selectedCity.name,
            cdekShipmentPoint: effectivePointCode,
          }
        : { cdekCityCode: null, cdekCityName: null, cdekShipmentPoint: null },
    );
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    const nextErrors: FieldErrors = {};

    if (trimmedName.length === 0) {
      nextErrors.name = "Введите название магазина.";
    } else if (trimmedName.length > 80) {
      nextErrors.name = "Название — до 80 символов.";
    }

    if (!isValidShopSlug(trimmedSlug)) {
      nextErrors.slug = SLUG_RULES;
    }

    if (description.length > 2000) {
      nextErrors.description = "Описание — до 2000 символов.";
    }

    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    saveMutation.mutate({
      name: trimmedName,
      slug: trimmedSlug,
      description: description.trim().length > 0 ? description.trim() : null,
    });
  }

  const meta = statusMeta[shop.status];
  const busy = saveMutation.isPending || statusMutation.isPending;
  const blocked = shop.status === "blocked";
  const isDirty =
    name.trim() !== shop.name ||
    slug.trim() !== shop.slug ||
    (description.trim().length > 0 ? description.trim() : null) !== (shop.description ?? null);
  const statusLocked = busy || isDirty || blocked;
  const publishPending = statusMutation.isPending && statusMutation.variables === "published";
  const unpublishPending = statusMutation.isPending && statusMutation.variables === "draft";

  return (
    <Grid>
      <GridColumn span={8}>
        <Card as="form" noValidate onSubmit={handleSave} aria-labelledby="shop-settings-title">
          <h2 id="shop-settings-title" className="font-display text-2xl uppercase">
            Настройки магазина
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Смена slug ломает старые ссылки на витрину.
          </p>

          {blocked ? (
            <p
              id="shop-blocked-note"
              className="mt-4 border-l-[3px] border-accent-orange pl-2 text-sm font-semibold leading-relaxed"
            >
              Платформа заблокировала магазин: изменения недоступны.
            </p>
          ) : null}

          <fieldset
            disabled={blocked}
            aria-describedby={blocked ? "shop-blocked-note" : undefined}
            className="mt-6"
          >
            <legend className="sr-only">Настройки магазина</legend>

            <Stack gap={6}>
              <FormField
                id="shop-name"
                label="Название"
                hint="Так магазин увидят покупатели. До 80 символов."
                error={errors.name}
              >
                <input
                  id="shop-name"
                  name="name"
                  type="text"
                  autoComplete="organization"
                  maxLength={80}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (errors.name) {
                      setErrors((current) => ({ ...current, name: undefined }));
                    }
                  }}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={fieldDescribedBy(
                    "shop-name",
                    "Так магазин увидят покупатели. До 80 символов.",
                    errors.name,
                  )}
                  className={fieldControlClass}
                />
              </FormField>

              <FormField
                id="shop-slug"
                label="Slug"
                hint={`Адрес витрины: /shops/${shop.slug}. ${SLUG_RULES}`}
                error={errors.slug}
              >
                <input
                  id="shop-slug"
                  name="slug"
                  type="text"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={40}
                  value={slug}
                  onChange={(event) => {
                    setSlug(event.target.value.toLowerCase());
                    if (errors.slug) {
                      setErrors((current) => ({ ...current, slug: undefined }));
                    }
                  }}
                  aria-invalid={errors.slug ? true : undefined}
                  aria-describedby={fieldDescribedBy(
                    "shop-slug",
                    `Адрес витрины: /shops/${shop.slug}. ${SLUG_RULES}`,
                    errors.slug,
                  )}
                  className={cn(fieldControlClass, "font-mono")}
                />
              </FormField>

              <FormField
                id="shop-description"
                label="Описание"
                hint="Необязательно. До 2000 символов."
                error={errors.description}
              >
                <textarea
                  id="shop-description"
                  name="description"
                  rows={5}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    if (errors.description) {
                      setErrors((current) => ({ ...current, description: undefined }));
                    }
                  }}
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={fieldDescribedBy(
                    "shop-description",
                    "Необязательно. До 2000 символов.",
                    errors.description,
                  )}
                  className={cn(fieldControlClass, "min-h-36 resize-y")}
                />
              </FormField>

              <FormError message={formError} />

              <Button
                type="submit"
                size="lg"
                className="w-full sm:w-auto"
                disabled={busy || blocked}
              >
                {saveMutation.isPending ? "Сохраняем…" : "Сохранить изменения"}
              </Button>
            </Stack>
          </fieldset>
        </Card>

        <Card as="section" className="mt-6" aria-labelledby="shop-delivery-title">
          <h2 id="shop-delivery-title" className="font-display text-2xl uppercase">
            Доставка
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Город и ПВЗ, откуда вы сдаёте посылки СДЭК. От них зависит цена доставки для
            покупателей.
          </p>

          {selectedCity ? (
            <p className="mt-4 border-l-[3px] border-accent-green pl-2 text-sm font-semibold">
              Город сдачи: {selectedCity.name}
            </p>
          ) : (
            <p className="mt-4 border-l-[3px] border-accent-orange pl-2 text-sm font-semibold leading-relaxed">
              Город сдачи не настроен. Покупатели не смогут оформить доставку, пока вы не выберете
              город и ПВЗ.
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <FormField
              id="shop-delivery-city-search"
              label="Поиск города"
              hint="Введите минимум два символа, затем выберите город из списка."
            >
              <input
                id="shop-delivery-city-search"
                name="cityQuery"
                type="search"
                autoComplete="off"
                value={cityQuery}
                onChange={(event) => setCityQuery(event.target.value)}
                aria-describedby={fieldDescribedBy(
                  "shop-delivery-city-search",
                  "Введите минимум два символа, затем выберите город из списка.",
                )}
                className={fieldControlClass}
                disabled={blocked}
              />
            </FormField>

            <FormField
              id="shop-delivery-city"
              label="Город сдачи"
              hint="Город, из которого отправляете посылки."
            >
              <select
                id="shop-delivery-city"
                name="cdekCityCode"
                value={selectedCity === null ? "" : String(selectedCity.code)}
                onChange={(event) => {
                  const code = Number(event.target.value);
                  const city = cityResults.find((item) => item.code === code);
                  if (!city) {
                    return;
                  }
                  if (city.code !== selectedCity?.code) {
                    setPointCode("");
                  }
                  setSelectedCity(city);
                  setDeliveryError(null);
                  setPointInvalid(false);
                }}
                aria-describedby={fieldDescribedBy(
                  "shop-delivery-city",
                  "Город, из которого отправляете посылки.",
                )}
                className={fieldControlClass}
                disabled={blocked || (selectedCity === null && cityResults.length === 0)}
              >
                {selectedCity === null ? (
                  <option value="">
                    {citiesQuery.isFetching ? "Ищем города…" : "Выберите город"}
                  </option>
                ) : null}
                {selectedCityMissing && selectedCity ? (
                  <option value={selectedCity.code}>{selectedCity.name}</option>
                ) : null}
                {cityResults.map((city) => (
                  <option key={city.code} value={city.code}>
                    {city.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <p aria-live="polite" className="mt-3 text-sm leading-relaxed text-ink/70">
            {cityStatus}
          </p>

          {citiesQuery.isError ? (
            <div role="alert" className="mt-3 border-[3px] border-ink p-3">
              <p className="text-sm font-semibold">
                {deliveryLookupErrorMessage(citiesQuery.error, "города")}
              </p>
              <button
                type="button"
                onClick={() => void citiesQuery.refetch()}
                className="mt-2 inline-flex min-h-11 items-center font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4"
              >
                Повторить поиск городов
              </button>
            </div>
          ) : null}

          {selectedCity ? (
            <div className="mt-6">
              <FormField
                id="shop-delivery-point"
                label="Пункт выдачи"
                hint="ПВЗ, куда вы сдаёте посылки."
              >
                <select
                  id="shop-delivery-point"
                  name="cdekShipmentPoint"
                  value={effectivePointCode}
                  onChange={(event) => {
                    setPointCode(event.target.value);
                    setPointInvalid(false);
                    setDeliveryError(null);
                  }}
                  aria-invalid={pointInvalid ? true : undefined}
                  aria-describedby="shop-delivery-point-hint shop-delivery-error"
                  className={fieldControlClass}
                  disabled={blocked || pointsQuery.isPending || pointsQuery.isError}
                >
                  <option value="">
                    {pointsQuery.isFetching ? "Загружаем ПВЗ…" : "Выберите ПВЗ"}
                  </option>
                  {savedPointFallback ? (
                    <option value={pointCode}>Сохранённый ПВЗ {pointCode}</option>
                  ) : null}
                  {points.map((point) => (
                    <option key={point.code} value={point.code}>
                      {point.name} — {point.address}
                    </option>
                  ))}
                </select>
              </FormField>

              {savedPointUnavailable ? (
                <p
                  role="alert"
                  className="mt-3 border-l-[3px] border-accent-orange pl-2 text-sm font-semibold leading-relaxed"
                >
                  Сохранённый ПВЗ {pointCode} больше не доступен. Выберите другой пункт выдачи.
                </p>
              ) : null}

              <p aria-live="polite" className="mt-3 text-sm leading-relaxed text-ink/70">
                {pointsStatus}
              </p>

              {pointsQuery.isError ? (
                <div role="alert" className="mt-3 border-[3px] border-ink p-3">
                  <p className="text-sm font-semibold">
                    {deliveryLookupErrorMessage(pointsQuery.error, "ПВЗ")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void pointsQuery.refetch()}
                    className="mt-2 inline-flex min-h-11 items-center font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4"
                  >
                    Повторить загрузку ПВЗ
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-4 sm:flex-row">
            <Button
              type="button"
              size="lg"
              onClick={handleSaveDelivery}
              disabled={!deliveryDirty || deliveryMutation.isPending || blocked}
            >
              {deliveryMutation.isPending ? "Сохраняем…" : "Сохранить доставку"}
            </Button>
            {selectedCity ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setSelectedCity(null);
                  setPointCode("");
                  setPointInvalid(false);
                  setDeliveryError(null);
                }}
                disabled={deliveryMutation.isPending || blocked}
              >
                Убрать город сдачи
              </Button>
            ) : null}
          </div>

          <div id="shop-delivery-error" className="mt-4">
            <FormError message={deliveryError} />
          </div>
        </Card>
      </GridColumn>

      <Sidebar>
        <Stack gap={4}>
          <Card as="section" aria-labelledby="shop-status-title">
            <h2 id="shop-status-title" className="font-mono text-[10px] uppercase tracking-[0.2em]">
              Статус
            </h2>
            <div className="mt-4">
              <ShopStatusBadge status={shop.status} />
            </div>
            <p className="mt-4 text-sm leading-relaxed">{meta.description}</p>

            <FormError message={statusError} />

            {isDirty && !blocked ? (
              <output className="mt-4 block text-sm font-semibold">
                Сначала сохраните изменения.
              </output>
            ) : null}

            <div className="mt-6 flex flex-col gap-4">
              {shop.status === "draft" ? (
                <Button
                  type="button"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    setStatusError(null);
                    statusMutation.mutate("published");
                  }}
                  disabled={statusLocked}
                >
                  {publishPending ? "Публикуем…" : "Опубликовать"}
                </Button>
              ) : null}

              {shop.status === "published" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    setStatusError(null);
                    statusMutation.mutate("draft");
                  }}
                  disabled={statusLocked}
                >
                  {unpublishPending ? "Снимаем…" : "Снять с публикации"}
                </Button>
              ) : null}
            </div>
          </Card>

          <SellerPaymentsCard />

          <Card as="section" aria-labelledby="shop-public-title">
            <h2 id="shop-public-title" className="font-mono text-[10px] uppercase tracking-[0.2em]">
              Публичная ссылка
            </h2>
            <p className="mt-4 break-all font-mono text-xs">/shops/{shop.slug}</p>
            {shop.status === "published" ? (
              <Link
                to={`/shops/${shop.slug}`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
              >
                Открыть витрину
                <ExternalLink aria-hidden="true" className="size-4" />
              </Link>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-ink/70">
                Ссылка станет публичной после публикации магазина.
              </p>
            )}
          </Card>
        </Stack>
      </Sidebar>
    </Grid>
  );
}
