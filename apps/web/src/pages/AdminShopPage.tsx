import { isValidShopSlug, type SellerShop, type UpdateShop } from "@localhand/shared";
import { Button, buttonVariants, cn } from "@localhand/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  Announcer,
  fieldControlClass,
  fieldDescribedBy,
  FormError,
  FormField,
} from "../components/FormField.js";
import { ScreenState } from "../components/ScreenState.js";
import { ApiError, createShop, updateShop } from "../lib/api.js";
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

export function AdminShopPage() {
  const shopQuery = useSellerShopQuery();
  const [announcement, setAnnouncement] = useState("");
  const shop = shopQuery.data?.shop ?? null;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red">
          Кабинет продавца
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl uppercase leading-none sm:text-4xl">Ваш магазин</h1>
          {shop ? <ShopStatusBadge status={shop.status} /> : null}
        </div>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed">
          {shop
            ? "Обновите данные, опубликуйте магазин и проверьте, как он выглядит на витрине."
            : "Один магазин на продавца. Заполните три поля, чтобы открыть витрину."}
        </p>
      </header>

      <div className="mt-4">
        <Announcer message={announcement} />
      </div>

      <div className="mt-6">
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
    </div>
  );
}

function ShopLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 401) {
    return (
      <ScreenState
        kind="empty"
        title="Сессия истекла"
        description="Войдите снова, чтобы открыть магазин."
        action={
          <Link
            to={`/login?next=${encodeURIComponent("/admin/shop")}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Войти
          </Link>
        }
      />
    );
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <form
        noValidate
        onSubmit={handleSubmit}
        aria-labelledby="onboarding-title"
        className="border-[3px] border-ink bg-paper p-4 sm:p-6"
      >
        <h2 id="onboarding-title" className="font-display text-2xl uppercase">
          Создать магазин
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">
          Название и адрес витрины можно изменить позже.
        </p>

        <div className="mt-6 space-y-6">
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
        </div>
      </form>

      <aside className="border-[3px] border-ink bg-ink p-5 text-paper sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-orange">
          Как это работает
        </p>
        <ol className="mt-4 space-y-4 text-sm leading-relaxed text-paper/85">
          <li className="flex gap-3">
            <span aria-hidden="true" className="font-mono text-accent-green">
              01
            </span>
            Заполните название и slug — это адрес витрины.
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="font-mono text-accent-green">
              02
            </span>
            Добавьте описание: что продаёте и чем отличаетесь.
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="font-mono text-accent-green">
              03
            </span>
            Опубликуйте магазин — и он появится на витрине.
          </li>
        </ol>
        <p className="mt-6 border-t-[3px] border-paper/30 pt-4 font-mono text-[10px] uppercase leading-relaxed tracking-wide text-paper/60">
          Slug закрепляется за магазином в публичной ссылке
        </p>
      </aside>
    </div>
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
  const publishPending = statusMutation.isPending && statusMutation.variables === "published";
  const unpublishPending = statusMutation.isPending && statusMutation.variables === "draft";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <form
        noValidate
        onSubmit={handleSave}
        aria-labelledby="shop-settings-title"
        className="border-[3px] border-ink bg-paper p-4 sm:p-6"
      >
        <h2 id="shop-settings-title" className="font-display text-2xl uppercase">
          Настройки магазина
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">
          Смена slug ломает старые ссылки на витрину.
        </p>

        <div className="mt-6 space-y-6">
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

          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
            {saveMutation.isPending ? "Сохраняем…" : "Сохранить изменения"}
          </Button>
        </div>
      </form>

      <aside className="space-y-4">
        <section
          aria-labelledby="shop-status-title"
          className="border-[3px] border-ink bg-paper p-4 sm:p-5"
        >
          <h2 id="shop-status-title" className="font-mono text-[10px] uppercase tracking-[0.2em]">
            Статус
          </h2>
          <div className="mt-3">
            <ShopStatusBadge status={shop.status} />
          </div>
          <p className="mt-3 text-sm leading-relaxed">{meta.description}</p>

          <FormError message={statusError} />

          <div className="mt-4 flex flex-col gap-3">
            {shop.status === "draft" ? (
              <Button
                type="button"
                size="md"
                className="w-full"
                onClick={() => {
                  setStatusError(null);
                  statusMutation.mutate("published");
                }}
                disabled={busy}
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
                disabled={busy}
              >
                {unpublishPending ? "Снимаем…" : "Снять с публикации"}
              </Button>
            ) : null}
          </div>
        </section>

        <section
          aria-labelledby="shop-public-title"
          className="border-[3px] border-ink bg-paper p-4 sm:p-5"
        >
          <h2 id="shop-public-title" className="font-mono text-[10px] uppercase tracking-[0.2em]">
            Публичная ссылка
          </h2>
          <p className="mt-3 break-all font-mono text-xs">/shops/{shop.slug}</p>
          {shop.status === "published" ? (
            <Link
              to={`/shops/${shop.slug}`}
              className="mt-4 inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase underline decoration-[3px] underline-offset-4 hover:text-accent-red"
            >
              Открыть витрину
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Ссылка станет публичной после публикации магазина.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
