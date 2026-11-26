export const KOPECKS_PER_RUBBLE = 100;

export type Kopecks = number & { readonly __brand: "Kopecks" };

export function kopecks(value: number): Kopecks {
  if (!Number.isInteger(value)) {
    throw new Error("Kopecks must be an integer");
  }
  if (value < 0) {
    throw new Error("Kopecks must be non-negative");
  }
  return value as Kopecks;
}

export function rublesToKopecks(rubles: number): Kopecks {
  return kopecks(Math.round(rubles * KOPECKS_PER_RUBBLE));
}

export function formatRubles(value: Kopecks): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
  }).format(value / KOPECKS_PER_RUBBLE);
}
