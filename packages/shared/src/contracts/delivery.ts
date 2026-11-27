import { z } from "zod";
import { ORDER_ID_MAX, ORDER_MAX_ITEMS, ORDER_TOTAL_MAX_KOPECKS } from "./limits.js";

export const DELIVERY_CITY_NAME_MAX_LENGTH = 120;
export const DELIVERY_POINT_CODE_MAX_LENGTH = 64;
export const DELIVERY_POINT_NAME_MAX_LENGTH = 160;
export const DELIVERY_POINT_ADDRESS_MAX_LENGTH = 300;
export const DELIVERY_TARIFF_CODE_MAX_LENGTH = 64;
export const DELIVERY_TARIFF_NAME_MAX_LENGTH = 120;
export const DELIVERY_RECIPIENT_NAME_MAX_LENGTH = 100;
export const DELIVERY_CARRIER_MAX_LENGTH = 80;
export const DELIVERY_TRACK_NUMBER_MAX_LENGTH = 64;
export const DELIVERY_QUOTE_TOKEN_MAX_LENGTH = 32_768;
export const DELIVERY_QUOTE_TTL_SECONDS = 600;

function hasNoNulByte(value: string): boolean {
  return !value.includes("\u0000");
}

const NUL_BYTE_MESSAGE = { message: "nul_byte" };
const TRACK_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;

const BoundedText = (max: number) =>
  z.string().trim().min(1).max(max).refine(hasNoNulByte, NUL_BYTE_MESSAGE);

export const DeliveryCityCodeSchema = z.number().int().positive().max(ORDER_ID_MAX);
/** Manual/legacy snapshots may not know a CDEK city code. */
export const DeliverySnapshotCityCodeSchema = z.number().int().min(0).max(ORDER_ID_MAX);

export const DeliveryCitySchema = z.object({
  code: DeliveryCityCodeSchema,
  name: BoundedText(DELIVERY_CITY_NAME_MAX_LENGTH),
});

export const DeliveryPointCodeSchema = BoundedText(DELIVERY_POINT_CODE_MAX_LENGTH);

export const DeliveryPointSchema = z.object({
  code: DeliveryPointCodeSchema,
  name: BoundedText(DELIVERY_POINT_NAME_MAX_LENGTH),
  address: BoundedText(DELIVERY_POINT_ADDRESS_MAX_LENGTH),
  cityCode: DeliveryCityCodeSchema,
  cityName: BoundedText(DELIVERY_CITY_NAME_MAX_LENGTH),
});

export const DeliveryCityListResponseSchema = z.object({
  cities: z.array(DeliveryCitySchema),
});

export const DeliveryPointListResponseSchema = z.object({
  points: z.array(DeliveryPointSchema),
});

export const DeliveryQuoteRequestSchema = z.object({
  items: z
    .array(z.object({ productId: z.number().int().positive().max(ORDER_ID_MAX) }))
    .min(1)
    .max(ORDER_MAX_ITEMS)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, {
      message: "duplicate_product",
    }),
  cityCode: DeliveryCityCodeSchema,
  pointCode: DeliveryPointCodeSchema,
});

export const DeliveryQuoteShopSchema = z.object({
  shopId: z.number().int().positive().max(ORDER_ID_MAX),
  tariffCode: BoundedText(DELIVERY_TARIFF_CODE_MAX_LENGTH),
  tariffName: BoundedText(DELIVERY_TARIFF_NAME_MAX_LENGTH),
  priceKopecks: z.number().int().min(0).max(ORDER_TOTAL_MAX_KOPECKS),
  periodMin: z.number().int().min(0).max(365),
  periodMax: z.number().int().min(0).max(365),
});

export const DeliveryQuoteResponseSchema = z.object({
  quoteToken: z.string().min(1).max(DELIVERY_QUOTE_TOKEN_MAX_LENGTH),
  expiresAt: z.iso.datetime({ offset: true }),
  shops: z.array(DeliveryQuoteShopSchema).min(1),
});

export const DeliveryQuoteTokenPayloadSchema = z.object({
  v: z.literal(1),
  productHash: z.string().min(1),
  cityCode: DeliveryCityCodeSchema,
  cityName: BoundedText(DELIVERY_CITY_NAME_MAX_LENGTH),
  pointCode: DeliveryPointCodeSchema,
  pointAddress: BoundedText(DELIVERY_POINT_ADDRESS_MAX_LENGTH),
  exp: z.number().int().positive(),
  shops: z
    .array(DeliveryQuoteShopSchema)
    .min(1)
    .max(ORDER_MAX_ITEMS)
    .refine((shops) => new Set(shops.map((shop) => shop.shopId)).size === shops.length, {
      message: "duplicate_shop",
    }),
});

export const DeliveryCheckoutSchema = z.object({
  cityCode: DeliveryCityCodeSchema,
  pointCode: DeliveryPointCodeSchema,
  recipientName: BoundedText(DELIVERY_RECIPIENT_NAME_MAX_LENGTH),
  quoteToken: z.string().min(1).max(DELIVERY_QUOTE_TOKEN_MAX_LENGTH),
});

export const DeliveryStatusSchema = z.enum([
  "quoted",
  "created",
  "in_transit",
  "delivered",
  "canceled",
  "manual",
  "failed",
]);

export const DeliveryProviderSchema = z.enum(["cdek", "manual", "fake"]);

export const DeliverySnapshotSchema = z.object({
  provider: DeliveryProviderSchema,
  status: DeliveryStatusSchema,
  cityCode: DeliverySnapshotCityCodeSchema,
  cityName: BoundedText(DELIVERY_CITY_NAME_MAX_LENGTH),
  pointCode: DeliveryPointCodeSchema,
  pointAddress: BoundedText(DELIVERY_POINT_ADDRESS_MAX_LENGTH),
  recipientName: BoundedText(DELIVERY_RECIPIENT_NAME_MAX_LENGTH),
  tariffCode: BoundedText(DELIVERY_TARIFF_CODE_MAX_LENGTH).nullable(),
  tariffName: BoundedText(DELIVERY_TARIFF_NAME_MAX_LENGTH).nullable(),
  priceKopecks: z.number().int().min(0).max(ORDER_TOTAL_MAX_KOPECKS),
  periodMin: z.number().int().min(0).max(365).nullable(),
  periodMax: z.number().int().min(0).max(365).nullable(),
  providerOrderId: z.string().min(1).max(128).nullable(),
  providerNumber: z.string().min(1).max(64).nullable(),
  carrier: BoundedText(DELIVERY_CARRIER_MAX_LENGTH).nullable(),
  trackNumber: BoundedText(DELIVERY_TRACK_NUMBER_MAX_LENGTH).nullable(),
  lastStatusCode: z.string().min(1).max(64).nullable(),
  lastStatusAt: z.iso.datetime({ offset: true }).nullable(),
});

export const DeliveryResponseSchema = z.object({
  delivery: DeliverySnapshotSchema,
});

export const DeliveryShipmentCreateSchema = z.object({
  tariffCode: BoundedText(DELIVERY_TARIFF_CODE_MAX_LENGTH),
});

export const DeliveryManualTrackSchema = z.object({
  carrier: BoundedText(DELIVERY_CARRIER_MAX_LENGTH),
  trackNumber: z
    .string()
    .trim()
    .min(1)
    .max(DELIVERY_TRACK_NUMBER_MAX_LENGTH)
    .regex(TRACK_NUMBER_PATTERN, { message: "invalid_track_number" }),
});

export const DeliveryTariffListResponseSchema = z.object({
  paid: z.object({
    tariffCode: BoundedText(DELIVERY_TARIFF_CODE_MAX_LENGTH),
    priceKopecks: z.number().int().min(0).max(ORDER_TOTAL_MAX_KOPECKS),
  }),
  tariffs: z.array(DeliveryQuoteShopSchema),
});

export type DeliveryCity = z.infer<typeof DeliveryCitySchema>;
export type DeliveryPoint = z.infer<typeof DeliveryPointSchema>;
export type DeliveryCityListResponse = z.infer<typeof DeliveryCityListResponseSchema>;
export type DeliveryPointListResponse = z.infer<typeof DeliveryPointListResponseSchema>;
export type DeliveryQuoteRequest = z.infer<typeof DeliveryQuoteRequestSchema>;
export type DeliveryQuoteShop = z.infer<typeof DeliveryQuoteShopSchema>;
export type DeliveryQuoteResponse = z.infer<typeof DeliveryQuoteResponseSchema>;
export type DeliveryQuoteTokenPayload = z.infer<typeof DeliveryQuoteTokenPayloadSchema>;
export type DeliveryCheckout = z.infer<typeof DeliveryCheckoutSchema>;
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
export type DeliveryProvider = z.infer<typeof DeliveryProviderSchema>;
export type DeliverySnapshot = z.infer<typeof DeliverySnapshotSchema>;
export type DeliveryResponse = z.infer<typeof DeliveryResponseSchema>;
export type DeliveryShipmentCreate = z.infer<typeof DeliveryShipmentCreateSchema>;
export type DeliveryManualTrack = z.infer<typeof DeliveryManualTrackSchema>;
export type DeliveryTariffListResponse = z.infer<typeof DeliveryTariffListResponseSchema>;
