export type DeliveryPackageInput = {
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type DeliveryPackaging = DeliveryPackageInput;

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

/**
 * One parcel per order: weights add up, dimensions are the maximum of the
 * items, and the volumetric weight uses CDEK's 1:5000 kg/cm3 ratio converted
 * to grams, rounded up so the quote never undercharges.
 */
export function calculatePackaging(items: DeliveryPackageInput[]): DeliveryPackaging {
  if (items.length === 0) {
    throw new Error("at least one package item is required");
  }

  let weightG = 0;
  let lengthCm = 0;
  let widthCm = 0;
  let heightCm = 0;

  for (const item of items) {
    assertPositiveInteger(item.weightG, "weightG");
    assertPositiveInteger(item.lengthCm, "lengthCm");
    assertPositiveInteger(item.widthCm, "widthCm");
    assertPositiveInteger(item.heightCm, "heightCm");

    weightG += item.weightG;
    lengthCm = Math.max(lengthCm, item.lengthCm);
    widthCm = Math.max(widthCm, item.widthCm);
    heightCm = Math.max(heightCm, item.heightCm);
  }

  const volumetricG = Math.ceil((lengthCm * widthCm * heightCm) / 5);
  return {
    weightG: Math.max(weightG, volumetricG),
    lengthCm,
    widthCm,
    heightCm,
  };
}
