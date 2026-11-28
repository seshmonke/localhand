import {
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_DIMENSION_MAX_CM,
  PRODUCT_IMAGE_URL_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_PRICE_MAX_KOPECKS,
  PRODUCT_WEIGHT_MAX_G,
  rublesToKopecks,
  type CreateProduct,
  type SellerProduct,
  type UpdateProduct,
} from "@localhand/shared";

export type ProductFormValues = {
  name: string;
  description: string;
  price: string;
  weightG: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  imageUrl: string;
};

export type ProductFieldErrors = {
  name?: string;
  description?: string;
  price?: string;
  weightG?: string;
  lengthCm?: string;
  widthCm?: string;
  heightCm?: string;
  imageUrl?: string;
};

export type NormalizedProduct = {
  name: string;
  description: string | null;
  priceKopecks: number;
  weightG: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  imageUrl: string | null;
};

export const emptyProductForm: ProductFormValues = {
  name: "",
  description: "",
  price: "",
  weightG: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  imageUrl: "",
};

/** Shows integer kopecks as an editable ruble amount, e.g. 123450 -> "1234,50". */
export function formatPriceInput(priceKopecks: number): string {
  const rubles = Math.floor(priceKopecks / 100);
  const cents = priceKopecks % 100;
  return cents === 0 ? String(rubles) : `${rubles},${String(cents).padStart(2, "0")}`;
}

export function productToForm(product: SellerProduct): ProductFormValues {
  return {
    name: product.name,
    description: product.description ?? "",
    price: formatPriceInput(product.priceKopecks),
    weightG: formatDimensionInput(product.weightG),
    lengthCm: formatDimensionInput(product.lengthCm),
    widthCm: formatDimensionInput(product.widthCm),
    heightCm: formatDimensionInput(product.heightCm),
    imageUrl: product.imageUrl ?? "",
  };
}

function formatDimensionInput(value: number | null): string {
  return value === null ? "" : String(value);
}

const DIMENSION_RULES = [
  { field: "weightG", label: "Вес", unit: "г", max: PRODUCT_WEIGHT_MAX_G },
  { field: "lengthCm", label: "Длина", unit: "см", max: PRODUCT_DIMENSION_MAX_CM },
  { field: "widthCm", label: "Ширина", unit: "см", max: PRODUCT_DIMENSION_MAX_CM },
  { field: "heightCm", label: "Высота", unit: "см", max: PRODUCT_DIMENSION_MAX_CM },
] as const;

type DimensionField = (typeof DIMENSION_RULES)[number]["field"];
type Dimensions = Record<DimensionField, number | null>;

/** Empty means "not set"; `undefined` means invalid (zero, negative, fractional, too large). */
function parseOptionalPositiveInteger(raw: string, max: number): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    return undefined;
  }
  return value;
}

function parseDimensions(values: ProductFormValues, errors: ProductFieldErrors): Dimensions {
  const dimensions: Dimensions = {
    weightG: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
  };

  for (const rule of DIMENSION_RULES) {
    const parsed = parseOptionalPositiveInteger(values[rule.field], rule.max);
    if (parsed === undefined) {
      errors[rule.field] = `${rule.label} — целое число от 1 до ${rule.max} ${rule.unit}.`;
    } else {
      dimensions[rule.field] = parsed;
    }
  }

  return dimensions;
}

export type ParsedPrice = { ok: true; priceKopecks: number } | { ok: false; error: string };

/** Accepts "1234,50" and "1234.50" and converts rubles to integer kopecks. */
export function parsePriceInput(raw: string): ParsedPrice {
  const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");

  if (normalized.length === 0) {
    return { ok: false, error: "Введите цену." };
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return {
      ok: false,
      error: "Цена — число в рублях, до двух знаков после запятой, без минуса.",
    };
  }

  const rubles = Number(normalized);
  if (!Number.isFinite(rubles)) {
    return { ok: false, error: "Цена — число в рублях." };
  }

  const priceKopecks = rublesToKopecks(rubles);
  if (priceKopecks > PRODUCT_PRICE_MAX_KOPECKS) {
    return { ok: false, error: "Слишком большая цена." };
  }

  return { ok: true, priceKopecks };
}

export function validateProductForm(values: ProductFormValues): {
  errors: ProductFieldErrors;
  value: NormalizedProduct | null;
} {
  const errors: ProductFieldErrors = {};

  const name = values.name.trim();
  if (name.length === 0) {
    errors.name = "Введите название товара.";
  } else if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    errors.name = `Название — до ${PRODUCT_NAME_MAX_LENGTH} символов.`;
  }

  if (values.description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Описание — до ${PRODUCT_DESCRIPTION_MAX_LENGTH} символов.`;
  }

  const price = parsePriceInput(values.price);
  if (!price.ok) {
    errors.price = price.error;
  }

  const imageUrl = values.imageUrl.trim();
  if (imageUrl.length > PRODUCT_IMAGE_URL_MAX_LENGTH) {
    errors.imageUrl = `Ссылка на изображение — до ${PRODUCT_IMAGE_URL_MAX_LENGTH} символов.`;
  }

  const dimensions = parseDimensions(values, errors);

  if (Object.keys(errors).length > 0 || !price.ok) {
    return { errors, value: null };
  }

  const description = values.description.trim();

  return {
    errors,
    value: {
      name,
      description: description.length > 0 ? description : null,
      priceKopecks: price.priceKopecks,
      ...dimensions,
      imageUrl: imageUrl.length > 0 ? imageUrl : null,
    },
  };
}

/** Create always starts as a draft: status is not part of the payload. */
export function toCreateProduct(value: NormalizedProduct): CreateProduct {
  return {
    name: value.name,
    priceKopecks: value.priceKopecks,
    imageUrl: value.imageUrl,
    ...(value.description === null ? {} : { description: value.description }),
    ...(value.weightG === null ? {} : { weightG: value.weightG }),
    ...(value.lengthCm === null ? {} : { lengthCm: value.lengthCm }),
    ...(value.widthCm === null ? {} : { widthCm: value.widthCm }),
    ...(value.heightCm === null ? {} : { heightCm: value.heightCm }),
  };
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** PATCH carries only fields whose value differs from the cached product. */
export function diffProduct(product: SellerProduct, value: NormalizedProduct): UpdateProduct {
  const changes: UpdateProduct = {};

  if (value.name !== product.name.trim()) {
    changes.name = value.name;
  }
  if (value.description !== normalizeOptionalText(product.description)) {
    changes.description = value.description;
  }
  if (value.priceKopecks !== product.priceKopecks) {
    changes.priceKopecks = value.priceKopecks;
  }
  if (value.weightG !== product.weightG) {
    changes.weightG = value.weightG;
  }
  if (value.lengthCm !== product.lengthCm) {
    changes.lengthCm = value.lengthCm;
  }
  if (value.widthCm !== product.widthCm) {
    changes.widthCm = value.widthCm;
  }
  if (value.heightCm !== product.heightCm) {
    changes.heightCm = value.heightCm;
  }
  if (value.imageUrl !== normalizeOptionalText(product.imageUrl)) {
    changes.imageUrl = value.imageUrl;
  }

  return changes;
}

export function isProductFormDirty(product: SellerProduct, values: ProductFormValues): boolean {
  if (values.name.trim() !== product.name.trim()) {
    return true;
  }

  if (normalizeOptionalText(values.description) !== normalizeOptionalText(product.description)) {
    return true;
  }

  if (normalizeOptionalText(values.imageUrl) !== normalizeOptionalText(product.imageUrl)) {
    return true;
  }

  for (const rule of DIMENSION_RULES) {
    const parsed = parseOptionalPositiveInteger(values[rule.field], rule.max);
    const unchanged =
      parsed === undefined
        ? values[rule.field].trim() === formatDimensionInput(product[rule.field])
        : parsed === product[rule.field];
    if (!unchanged) {
      return true;
    }
  }

  const price = parsePriceInput(values.price);
  if (!price.ok) {
    return values.price.trim() !== formatPriceInput(product.priceKopecks);
  }

  return price.priceKopecks !== product.priceKopecks;
}
