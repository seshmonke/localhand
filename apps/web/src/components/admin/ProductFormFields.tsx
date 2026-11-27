import { PRODUCT_DESCRIPTION_MAX_LENGTH, PRODUCT_NAME_MAX_LENGTH } from "@localhand/shared";
import { cn } from "@localhand/ui";
import { fieldControlClass, fieldDescribedBy, FormField } from "../FormField.js";
import type { ProductFieldErrors, ProductFormValues } from "./product-form.js";

const NAME_HINT = `Так товар увидят покупатели. До ${PRODUCT_NAME_MAX_LENGTH} символов.`;
const DESCRIPTION_HINT = `Необязательно. До ${PRODUCT_DESCRIPTION_MAX_LENGTH} символов.`;
const PRICE_HINT = "В рублях, например 1234,50. Ноль разрешён: товар будет бесплатным.";
const IMAGE_HINT = "Необязательно. Прямая ссылка на изображение; загрузка файлов появится позже.";

type ProductFormFieldsProps = {
  values: ProductFormValues;
  errors: ProductFieldErrors;
  onChange: (field: keyof ProductFormValues, value: string) => void;
};

export function ProductFormFields({ values, errors, onChange }: ProductFormFieldsProps) {
  return (
    <div className="space-y-6">
      <FormField id="product-name" label="Название" hint={NAME_HINT} error={errors.name}>
        <input
          id="product-name"
          name="name"
          type="text"
          required
          maxLength={PRODUCT_NAME_MAX_LENGTH}
          value={values.name}
          onChange={(event) => onChange("name", event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={fieldDescribedBy("product-name", NAME_HINT, errors.name)}
          className={fieldControlClass}
        />
      </FormField>

      <FormField
        id="product-description"
        label="Описание"
        hint={DESCRIPTION_HINT}
        error={errors.description}
      >
        <textarea
          id="product-description"
          name="description"
          rows={5}
          maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
          value={values.description}
          onChange={(event) => onChange("description", event.target.value)}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={fieldDescribedBy(
            "product-description",
            DESCRIPTION_HINT,
            errors.description,
          )}
          className={cn(fieldControlClass, "min-h-32 resize-y")}
        />
      </FormField>

      <FormField id="product-price" label="Цена, ₽" hint={PRICE_HINT} error={errors.price}>
        <input
          id="product-price"
          name="price"
          type="text"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="1234,50"
          value={values.price}
          onChange={(event) => onChange("price", event.target.value)}
          aria-invalid={errors.price ? true : undefined}
          aria-describedby={fieldDescribedBy("product-price", PRICE_HINT, errors.price)}
          className={cn(fieldControlClass, "font-mono tabular-nums")}
        />
      </FormField>

      <FormField
        id="product-image-url"
        label="Ссылка на изображение"
        hint={IMAGE_HINT}
        error={errors.imageUrl}
      >
        <input
          id="product-image-url"
          name="imageUrl"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={2000}
          placeholder="https://example.com/photo.jpg"
          value={values.imageUrl}
          onChange={(event) => onChange("imageUrl", event.target.value)}
          aria-invalid={errors.imageUrl ? true : undefined}
          aria-describedby={fieldDescribedBy("product-image-url", IMAGE_HINT, errors.imageUrl)}
          className={cn(fieldControlClass, "font-mono text-sm")}
        />
      </FormField>
    </div>
  );
}
