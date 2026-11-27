import {
  type ProductStatus,
  type SellerProduct,
  type SellerProductListResponse,
  type SellerShop,
  type UpdateProduct,
} from "@localhand/shared";
import { Button, buttonVariants } from "@localhand/ui";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Announcer, FormError } from "../components/FormField.js";
import { ProductFormFields } from "../components/admin/ProductFormFields.js";
import { ProductStatusBadge, productStatusMeta } from "../components/admin/ProductStatusBadge.js";
import {
  productErrorMessage,
  productStatusErrorMessage,
} from "../components/admin/product-errors.js";
import {
  diffProduct,
  emptyProductForm,
  isProductFormDirty,
  productToForm,
  toCreateProduct,
  validateProductForm,
  type ProductFieldErrors,
  type ProductFormValues,
} from "../components/admin/product-form.js";
import { ScreenState } from "../components/ScreenState.js";
import { ApiError, createProduct, updateProduct } from "../lib/api.js";
import { sellerKeys, useSellerProductsQuery, useSellerShopQuery } from "../lib/queries.js";

const FIELD_IDS: Array<[keyof ProductFieldErrors, string]> = [
  ["name", "product-name"],
  ["description", "product-description"],
  ["price", "product-price"],
  ["imageUrl", "product-image-url"],
];

function focusFirstError(errors: ProductFieldErrors) {
  const entry = FIELD_IDS.find(([field]) => errors[field]);
  if (entry) {
    document.getElementById(entry[1])?.focus();
  }
}

function replaceProductInList(queryClient: QueryClient, product: SellerProduct) {
  queryClient.setQueryData<SellerProductListResponse>(sellerKeys.products, (current) =>
    current
      ? {
          products: current.products.map((item) => (item.id === product.id ? product : item)),
        }
      : current,
  );
}

function ShopRequiredState() {
  return (
    <ScreenState
      kind="empty"
      title="Сначала создайте магазин"
      description="Товары хранятся внутри магазина. Настройте магазин, а затем добавьте товар."
      action={
        <Link to="/admin/shop" className={buttonVariants({ variant: "outline" })}>
          Настроить магазин
        </Link>
      }
    />
  );
}

function ProductsLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 401) {
    return (
      <ScreenState
        kind="error"
        title="Сессия истекла"
        description="Войдите снова, чтобы открыть товары."
        action={
          <Link
            to={`/login?next=${encodeURIComponent("/admin/products")}`}
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
      title="Товары не загрузились"
      description="Проверьте соединение и попробуйте снова."
      action={<Button onClick={onRetry}>Повторить</Button>}
    />
  );
}

function BackToProducts() {
  return (
    <Link
      to="/admin/products"
      className="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />К товарам
    </Link>
  );
}

export function AdminProductNewPage() {
  const shopQuery = useSellerShopQuery();
  const shop = shopQuery.data?.shop ?? null;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <header className="border-b-[3px] border-ink pb-6">
        <BackToProducts />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
          Кабинет продавца
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase leading-none sm:text-4xl">
          Новый товар
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed">
          Карточка сохранится черновиком. Опубликовать её можно, когда магазин опубликован.
        </p>
      </header>

      <div className="mt-6">
        {shopQuery.isPending ? (
          <ScreenState
            kind="loading"
            title="Загружаем магазин"
            description="Секунду — проверяем, готов ли кабинет к товарам."
          />
        ) : null}

        {shopQuery.isError ? (
          <ProductsLoadError error={shopQuery.error} onRetry={() => void shopQuery.refetch()} />
        ) : null}

        {shopQuery.isSuccess && !shop ? <ShopRequiredState /> : null}

        {shop ? <NewProductForm shopStatus={shop.status} /> : null}
      </div>
    </div>
  );
}

function NewProductForm({ shopStatus }: { shopStatus: SellerShop["status"] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ProductFormValues>(emptyProductForm);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError) {
      formErrorRef.current?.focus();
    }
  }, [formError]);

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: sellerKeys.products });
      navigate("/admin/products", {
        replace: true,
        state: { createdProduct: data.product.name },
      });
    },
    onError: (error) => {
      setFormError(productErrorMessage(error));
    },
  });

  function handleChange(field: keyof ProductFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateProductForm(values);
    setErrors(result.errors);
    setFormError(null);

    if (!result.value) {
      focusFirstError(result.errors);
      return;
    }

    createMutation.mutate(toCreateProduct(result.value));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <form
        noValidate
        onSubmit={handleSubmit}
        aria-labelledby="product-form-title"
        className="border-[3px] border-ink bg-paper p-4 sm:p-6"
      >
        <h2 id="product-form-title" className="font-display text-2xl uppercase">
          Данные товара
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">
          Название и цена обязательны. Описание и ссылка на изображение — по желанию.
        </p>

        <div className="mt-6">
          <ProductFormFields values={values} errors={errors} onChange={handleChange} />
        </div>

        <div ref={formErrorRef} tabIndex={-1} className="mt-6 focus-visible:outline-none">
          <FormError message={formError} />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            size="lg"
            className="w-full sm:w-auto"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Создаём…" : "Создать товар"}
          </Button>
          <Link
            to="/admin/products"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "w-full sm:w-auto",
            })}
          >
            Отмена
          </Link>
        </div>
      </form>

      <aside className="border-[3px] border-ink bg-inverse p-5 text-inverse-text sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent-orange">
          Что дальше
        </p>
        <ol className="mt-4 space-y-4 text-sm leading-relaxed text-inverse-text/85">
          <li className="flex gap-3">
            <span aria-hidden="true" className="font-mono text-accent-green">
              01
            </span>
            Заполните название, цену и описание.
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="font-mono text-accent-green">
              02
            </span>
            Сохраните карточку: она станет черновиком.
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="font-mono text-accent-green">
              03
            </span>
            {shopStatus === "published"
              ? "Опубликуйте товар — он появится на витрине."
              : "Опубликуйте магазин, затем товар."}
          </li>
        </ol>
        {shopStatus !== "published" ? (
          <Link
            to="/admin/shop"
            className="mt-6 inline-flex min-h-11 items-center border-t-[3px] border-inverse-text/30 pt-4 font-mono text-[10px] uppercase tracking-wide underline decoration-[3px] underline-offset-4"
          >
            Настроить магазин
          </Link>
        ) : null}
      </aside>
    </div>
  );
}

export function AdminProductEditPage() {
  const { id } = useParams();
  const productId = Number(id);
  const validId = Number.isInteger(productId) && productId > 0;
  const shopQuery = useSellerShopQuery();
  const shop = shopQuery.data?.shop ?? null;
  const productsQuery = useSellerProductsQuery(shop !== null && validId);
  const product = productsQuery.data?.products.find((item) => item.id === productId) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <header className="border-b-[3px] border-ink pb-6">
        <BackToProducts />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-accent-red-text">
          Кабинет продавца
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase leading-none sm:text-4xl">
          Редактирование товара
        </h1>
        {product ? <p className="mt-3 break-words text-sm font-semibold">{product.name}</p> : null}
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed">
          Сохраняются только изменённые поля. Публикация и скрытие — отдельными действиями.
        </p>
      </header>

      <div className="mt-6">
        {!validId ? (
          <ProductNotFoundState />
        ) : shopQuery.isPending ? (
          <ScreenState
            kind="loading"
            title="Загружаем товар"
            description="Секунду — ищем карточку в вашем магазине."
          />
        ) : shopQuery.isError ? (
          <ProductsLoadError error={shopQuery.error} onRetry={() => void shopQuery.refetch()} />
        ) : !shop ? (
          <ShopRequiredState />
        ) : productsQuery.isPending ? (
          <ScreenState
            kind="loading"
            title="Загружаем товар"
            description="Секунду — ищем карточку в вашем магазине."
          />
        ) : productsQuery.isError ? (
          <ProductsLoadError
            error={productsQuery.error}
            onRetry={() => void productsQuery.refetch()}
          />
        ) : !product ? (
          <ProductNotFoundState />
        ) : (
          <EditProductForm product={product} shop={shop} />
        )}
      </div>
    </div>
  );
}

function ProductNotFoundState() {
  return (
    <ScreenState
      kind="empty"
      title="Товар не найден"
      description="Возможно, карточку удалили или ссылка устарела. Откройте список товаров магазина."
      action={
        <Link to="/admin/products" className={buttonVariants()}>
          К списку товаров
        </Link>
      }
    />
  );
}

function EditProductForm({ product, shop }: { product: SellerProduct; shop: SellerShop }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ProductFormValues>(() => productToForm(product));
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<{
    message: string;
    shopLink: boolean;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const formErrorRef = useRef<HTMLDivElement>(null);
  const statusErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError) {
      formErrorRef.current?.focus();
    }
  }, [formError]);

  useEffect(() => {
    if (statusError) {
      statusErrorRef.current?.focus();
    }
  }, [statusError]);

  const isDirty = isProductFormDirty(product, values);

  const saveMutation = useMutation({
    mutationFn: (changes: UpdateProduct) => updateProduct(product.id, changes),
    onSuccess: (data) => {
      replaceProductInList(queryClient, data.product);
      void queryClient.invalidateQueries({ queryKey: sellerKeys.products });
      setValues(productToForm(data.product));
      setErrors({});
      setFormError(null);
      setAnnouncement("Изменения сохранены.");
    },
    onError: (error) => {
      setFormError(productErrorMessage(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: ProductStatus) => updateProduct(product.id, { status }),
    onSuccess: (data, status) => {
      replaceProductInList(queryClient, data.product);
      void queryClient.invalidateQueries({ queryKey: sellerKeys.products });
      setStatusError(null);
      setAnnouncement(
        status === "published"
          ? "Товар опубликован."
          : status === "hidden"
            ? "Товар скрыт."
            : "Товар возвращён в черновик.",
      );
    },
    onError: (error) => {
      setStatusError(productStatusErrorMessage(error));
    },
  });

  function handleChange(field: keyof ProductFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
    if (formError) {
      setFormError(null);
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateProductForm(values);
    setErrors(result.errors);
    setFormError(null);

    if (!result.value) {
      focusFirstError(result.errors);
      return;
    }

    const changes = diffProduct(product, result.value);
    if (Object.keys(changes).length === 0) {
      setAnnouncement("Изменений нет.");
      return;
    }

    saveMutation.mutate(changes);
  }

  const busy = saveMutation.isPending || statusMutation.isPending;
  const publishPending = statusMutation.isPending && statusMutation.variables === "published";
  const hidePending = statusMutation.isPending && statusMutation.variables === "hidden";
  const draftPending = statusMutation.isPending && statusMutation.variables === "draft";
  const shopPublished = shop.status === "published";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="space-y-4">
        <Announcer message={announcement} />

        <form
          noValidate
          onSubmit={handleSave}
          aria-labelledby="product-form-title"
          className="border-[3px] border-ink bg-paper p-4 sm:p-6"
        >
          <h2 id="product-form-title" className="font-display text-2xl uppercase">
            Данные товара
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Отправятся только поля, которые вы изменили.
          </p>

          <div className="mt-6">
            <ProductFormFields values={values} errors={errors} onChange={handleChange} />
          </div>

          <div ref={formErrorRef} tabIndex={-1} className="mt-6 focus-visible:outline-none">
            <FormError message={formError} />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={!isDirty || busy}
            >
              {saveMutation.isPending ? "Сохраняем…" : "Сохранить изменения"}
            </Button>
            <Link
              to="/admin/products"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              К списку
            </Link>
          </div>

          {!isDirty ? (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-ink/60">
              Изменений нет
            </p>
          ) : null}
        </form>
      </div>

      <aside className="space-y-4">
        <section
          aria-labelledby="product-status-title"
          className="border-[3px] border-ink bg-paper p-4 sm:p-5"
        >
          <h2
            id="product-status-title"
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
          >
            Статус
          </h2>
          <div className="mt-3">
            <ProductStatusBadge status={product.status} />
          </div>
          <p className="mt-3 text-sm leading-relaxed">
            {productStatusMeta[product.status].description}
          </p>

          {!shopPublished ? (
            <p className="mt-3 border-l-[3px] border-accent-orange pl-2 text-sm leading-relaxed">
              Публикация доступна после публикации магазина.{" "}
              <Link
                to="/admin/shop"
                className="inline-flex min-h-11 items-center font-semibold underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
              >
                Настроить магазин
              </Link>
            </p>
          ) : null}

          <div ref={statusErrorRef} tabIndex={-1} className="mt-3 focus-visible:outline-none">
            {statusError ? <FormError message={statusError.message} /> : null}
            {statusError?.shopLink ? (
              <Link
                to="/admin/shop"
                className="mt-2 inline-flex min-h-11 items-center font-mono text-[10px] uppercase tracking-wide underline decoration-[3px] underline-offset-4 hover:text-accent-red-text"
              >
                Открыть настройки магазина
              </Link>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Button
              type="button"
              size="md"
              className="w-full"
              onClick={() => {
                setStatusError(null);
                statusMutation.mutate("published");
              }}
              disabled={product.status === "published" || !shopPublished || busy}
            >
              {publishPending ? "Публикуем…" : "Опубликовать"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => {
                setStatusError(null);
                statusMutation.mutate("hidden");
              }}
              disabled={product.status === "hidden" || busy}
            >
              {hidePending ? "Скрываем…" : "Скрыть"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => {
                setStatusError(null);
                statusMutation.mutate("draft");
              }}
              disabled={product.status === "draft" || busy}
            >
              {draftPending ? "Возвращаем…" : "Вернуть в черновик"}
            </Button>
          </div>
        </section>

        <section
          aria-labelledby="product-public-title"
          className="border-[3px] border-ink bg-paper p-4 sm:p-5"
        >
          <h2
            id="product-public-title"
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
          >
            На витрине
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            {product.status === "published" && shopPublished
              ? "Товар виден покупателям в вашем магазине."
              : "Товар не показывается покупателям, пока не опубликованы и магазин, и товар."}
          </p>
        </section>
      </aside>
    </div>
  );
}
