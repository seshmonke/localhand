import {
  DELIVERY_QUOTE_TTL_SECONDS,
  type DeliveryCity,
  type DeliveryPoint,
  type DeliveryQuoteRequest,
  type DeliveryQuoteResponse,
  type DeliveryQuoteShop,
} from "@localhand/shared";
import { and, eq, inArray } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { products, shops } from "../db/schema.js";
import { deliverySettings } from "../env.js";
import { calculatePackaging } from "./packaging.js";
import { getDeliveryProvider } from "./provider-factory.js";
import { createQuoteToken, hashProductIds } from "./quote-token.js";

export type DeliveryFailure =
  | "delivery_unavailable"
  | "delivery_point_invalid"
  | "product_unavailable"
  | "delivery_dimensions_missing"
  | "shop_city_missing"
  | "shop_shipment_point_missing";

export type DeliveryQuoteResult =
  { ok: true; quote: DeliveryQuoteResponse } | { ok: false; error: DeliveryFailure };

type QuoteProductRow = {
  id: number;
  priceKopecks: number;
  shopId: number;
  weightG: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  shopCityCode: number | null;
  shopCityName: string | null;
  shopShipmentPoint: string | null;
};

type ShopGroup = {
  shopId: number;
  cityCode: number;
  cityName: string;
  shipmentPoint: string;
  items: QuoteProductRow[];
};

function isPositive(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

function groupByShop(rows: QuoteProductRow[]): ShopGroup[] {
  const groups = new Map<number, ShopGroup>();
  for (const row of rows) {
    const group = groups.get(row.shopId);
    if (!group) {
      groups.set(row.shopId, {
        shopId: row.shopId,
        cityCode: 0,
        cityName: "",
        shipmentPoint: "",
        items: [row],
      });
      continue;
    }
    group.items.push(row);
  }

  return [...groups.values()].sort((left, right) => left.shopId - right.shopId);
}

async function loadQuoteProducts(productIds: number[]): Promise<QuoteProductRow[]> {
  return requireDb()
    .select({
      id: products.id,
      priceKopecks: products.priceKopecks,
      shopId: products.shopId,
      weightG: products.weightG,
      lengthCm: products.lengthCm,
      widthCm: products.widthCm,
      heightCm: products.heightCm,
      shopCityCode: shops.cdekCityCode,
      shopCityName: shops.cdekCityName,
      shopShipmentPoint: shops.cdekShipmentPoint,
    })
    .from(products)
    .innerJoin(shops, eq(products.shopId, shops.id))
    .where(
      and(
        inArray(products.id, productIds),
        eq(products.status, "published"),
        eq(shops.status, "published"),
      ),
    )
    .orderBy(products.id);
}

export async function listDeliveryCities(query: string): Promise<DeliveryCity[] | null> {
  const provider = getDeliveryProvider();
  if (!provider) {
    return null;
  }

  try {
    return await provider.listCities(query);
  } catch {
    return null;
  }
}

export async function listDeliveryPoints(cityCode: number): Promise<DeliveryPoint[] | null> {
  const provider = getDeliveryProvider();
  if (!provider) {
    return null;
  }

  try {
    return await provider.listPoints(cityCode);
  } catch {
    return null;
  }
}

/**
 * Calculates one parcel per shop and signs the per-shop prices into a
 * short-lived token. The checkout never trusts a client-supplied price.
 */
export async function quoteDelivery(input: DeliveryQuoteRequest): Promise<DeliveryQuoteResult> {
  const provider = getDeliveryProvider();
  const settings = deliverySettings;
  if (!provider || !settings) {
    return { ok: false, error: "delivery_unavailable" };
  }

  let points: DeliveryPoint[];
  try {
    points = await provider.listPoints(input.cityCode);
  } catch {
    return { ok: false, error: "delivery_unavailable" };
  }

  const point = points.find((candidate) => candidate.code === input.pointCode);
  if (!point || point.cityCode !== input.cityCode) {
    return { ok: false, error: "delivery_point_invalid" };
  }

  const productIds = input.items.map((item) => item.productId);
  const rows = await loadQuoteProducts(productIds);
  if (rows.length !== productIds.length) {
    return { ok: false, error: "product_unavailable" };
  }

  const groups = groupByShop(rows);
  const quotes: DeliveryQuoteShop[] = [];

  for (const group of groups) {
    const cityCode = group.items[0]?.shopCityCode ?? null;
    const cityName = group.items[0]?.shopCityName ?? null;
    const shipmentPoint = group.items[0]?.shopShipmentPoint ?? null;
    if (!cityCode || !cityName) {
      return { ok: false, error: "shop_city_missing" };
    }
    if (!shipmentPoint) {
      return { ok: false, error: "shop_shipment_point_missing" };
    }

    if (
      !group.items.every(
        (item) =>
          isPositive(item.weightG) &&
          isPositive(item.lengthCm) &&
          isPositive(item.widthCm) &&
          isPositive(item.heightCm),
      )
    ) {
      return { ok: false, error: "delivery_dimensions_missing" };
    }

    const packaging = calculatePackaging(
      group.items.map((item) => ({
        weightG: item.weightG as number,
        lengthCm: item.lengthCm as number,
        widthCm: item.widthCm as number,
        heightCm: item.heightCm as number,
      })),
    );

    try {
      const tariff = await provider.quote({
        fromCityCode: cityCode,
        fromPointCode: shipmentPoint,
        toCityCode: input.cityCode,
        toPointCode: input.pointCode,
        packages: packaging,
      });
      quotes.push({ shopId: group.shopId, ...tariff });
    } catch {
      return { ok: false, error: "delivery_unavailable" };
    }
  }

  const now = new Date();
  const exp = Math.floor(now.getTime() / 1000) + DELIVERY_QUOTE_TTL_SECONDS;
  const quoteToken = createQuoteToken(
    {
      v: 1,
      productHash: hashProductIds(productIds),
      cityCode: input.cityCode,
      cityName: point.cityName,
      pointCode: input.pointCode,
      pointAddress: point.address,
      exp,
      shops: quotes,
    },
    settings.quoteSecret,
    now,
  );

  return {
    ok: true,
    quote: {
      quoteToken,
      expiresAt: new Date(exp * 1000).toISOString(),
      shops: quotes,
    },
  };
}
