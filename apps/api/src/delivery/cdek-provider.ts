import type { DeliveryCity, DeliveryPoint } from "@localhand/shared";
import { createTokenBucket } from "./rate-limiter.js";
import type {
  CreateShipmentInput,
  CreatedShipment,
  DeliveryProvider,
  DeliveryQuoteInput,
  DeliveryTariff,
  ShipmentState,
} from "./provider.js";

export type CdekConfig = {
  clientId: string;
  clientSecret: string;
  apiUrl: string;
  webhookUrl: string;
};

export type CdekOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

type CdekOrder = {
  uuid?: string;
  cdek_number?: string;
  number?: string;
  statuses?: Array<{ code?: string; name?: string; date_time?: string }>;
};

type CdekResponse = {
  entity?: CdekOrder;
  requests?: Array<{
    request_uuid?: string;
    state?: string;
    errors?: Array<{ code?: string; message?: string }>;
  }>;
};

type CdekTariff = {
  tariff_code?: number | string;
  tariff_name?: string;
  delivery_sum?: number;
  period_min?: number;
  period_max?: number;
  tariff_mode?: number;
};

type CdekTariffResponse = {
  tariff_codes?: CdekTariff[];
};

type CdekCity = { code?: number; city?: string };
type CdekPoint = {
  code?: string;
  name?: string;
  address?: string;
  city_code?: number;
  city?: string;
};

export class CdekError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message = "CDEK request failed") {
    super(message);
    this.name = "CdekError";
    this.status = status;
    this.code = code;
  }
}

/**
 * CDEK allows at most two webhook subscriptions. Two foreign subscriptions
 * mean an operator must remove one by hand: creating a third is impossible
 * and silently skipping the check would leave startup believing it is wired.
 */
export class DeliveryWebhookConflictError extends Error {
  constructor() {
    super("CDEK already has two foreign webhook subscriptions");
    this.name = "DeliveryWebhookConflictError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === "object" && value !== null && "items" in value) {
    const items = (value as { items?: unknown }).items;
    return Array.isArray(items) ? (items as T[]) : [];
  }
  return [];
}

function mapTariff(tariff: CdekTariff): DeliveryTariff | null {
  const code = tariff.tariff_code;
  const deliverySum = tariff.delivery_sum;
  if (code === undefined || typeof deliverySum !== "number" || !Number.isFinite(deliverySum)) {
    return null;
  }
  const priceKopecks = Math.round(deliverySum * 100);
  if (priceKopecks < 0) {
    return null;
  }
  return {
    tariffCode: String(code),
    tariffName: tariff.tariff_name ?? String(code),
    priceKopecks,
    periodMin: Number.isInteger(tariff.period_min) ? (tariff.period_min as number) : 0,
    periodMax: Number.isInteger(tariff.period_max) ? (tariff.period_max as number) : 0,
  };
}

function orderFromResponse(response: CdekResponse | CdekOrder): CdekOrder | null {
  if ("entity" in response && response.entity) {
    return response.entity;
  }
  if ("statuses" in response || "uuid" in response) {
    return response as CdekOrder;
  }
  return null;
}

/**
 * CDEK API v2 client. The adapter is stateless apart from the OAuth token and
 * process-local limiter; shipment state lives in our database, never here.
 */
export function createCdekDeliveryProvider(
  config: CdekConfig,
  options: CdekOptions = {},
): DeliveryProvider {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const pollTimeoutMs = options.pollTimeoutMs ?? 60_000;
  let token: { value: string; expiresAt: number } | null = null;
  const bucket = createTokenBucket({ capacity: 200, refillPerSecond: 200 });

  async function waitForOutboundSlot(): Promise<void> {
    while (!bucket.tryAcquire(Date.now())) {
      await sleep(5);
    }
  }

  async function authenticate(): Promise<string> {
    if (token && token.expiresAt > Date.now()) {
      return token.value;
    }

    const query = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    await waitForOutboundSlot();
    const response = await fetchImpl(`${config.apiUrl}/v2/oauth/token?${query.toString()}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !body.access_token) {
      throw new CdekError(response.status, "oauth_failed");
    }
    const expiresIn = Number.isInteger(body.expires_in) ? (body.expires_in as number) : 3599;
    token = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
    };
    return token.value;
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    retry = true,
    allowRefresh = true,
  ): Promise<T> {
    const accessToken = await authenticate();
    await waitForOutboundSlot();
    const response = await fetchImpl(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 401 && allowRefresh) {
      token = null;
      return request<T>(path, init, retry, false);
    }

    if (retry && (response.status === 429 || response.status >= 500) && init.method !== "POST") {
      await sleep(100);
      return request<T>(path, init, false, allowRefresh);
    }

    if (!response.ok) {
      throw new CdekError(response.status, "cdek_request_failed");
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async function tariffs(input: DeliveryQuoteInput): Promise<DeliveryTariff[]> {
    const body = {
      type: 1,
      from_location: { code: input.fromCityCode },
      to_location: { code: input.toCityCode },
      packages: [
        {
          weight: input.packages.weightG,
          length: input.packages.lengthCm,
          width: input.packages.widthCm,
          height: input.packages.heightCm,
        },
      ],
    };
    const response = await request<CdekTariffResponse>("/v2/calculator/tarifflist", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const all = (response.tariff_codes ?? [])
      .map((tariff) => ({ raw: tariff, mapped: mapTariff(tariff) }))
      .filter(
        (entry): entry is { raw: CdekTariff; mapped: DeliveryTariff } => entry.mapped !== null,
      );
    // CDEK marks tariff_mode=2 for PVZ. If the response carries modes, never
    // fall back to a cheaper door tariff for a PVZ checkout.
    const hasModes = all.some((entry) => typeof entry.raw.tariff_mode === "number");
    const pvz = all.filter((entry) => entry.raw.tariff_mode === 2);
    // If the provider exposes modes, a door-only response is not a valid PVZ
    // quote: return an empty list instead of silently using a door tariff.
    const selected = hasModes ? pvz : all;
    return selected
      .map((entry) => entry.mapped)
      .sort((left, right) => left.priceKopecks - right.priceKopecks);
  }

  async function pollOrder(requestUuid: string): Promise<CdekOrder> {
    const startedAt = Date.now();
    for (;;) {
      const response = await request<CdekResponse | CdekOrder>(
        `/v2/orders/${encodeURIComponent(requestUuid)}`,
      );
      const order = orderFromResponse(response);
      if (order) {
        return order;
      }
      if (Date.now() - startedAt >= pollTimeoutMs) {
        throw new CdekError(504, "order_poll_timeout");
      }
      if (pollIntervalMs > 0) {
        await sleep(pollIntervalMs);
      }
    }
  }

  return {
    name: "cdek",

    async listCities(query: string): Promise<DeliveryCity[]> {
      const params = new URLSearchParams({ country_codes: "RU", size: "20" });
      if (query.trim()) {
        params.set("city", query.trim());
      }
      const response = await request<unknown>(`/v2/location/cities?${params.toString()}`);
      return asArray<CdekCity>(response)
        .filter(
          (city): city is { code: number; city: string } =>
            Number.isInteger(city.code) && typeof city.city === "string" && city.city.length > 0,
        )
        .map((city) => ({ code: city.code, name: city.city }));
    },

    async listPoints(cityCode: number): Promise<DeliveryPoint[]> {
      const params = new URLSearchParams({
        city_code: String(cityCode),
        type: "PVZ",
        size: "1000",
      });
      const response = await request<unknown>(`/v2/deliverypoints?${params.toString()}`);
      return asArray<CdekPoint>(response)
        .filter(
          (point): point is CdekPoint & { code: string; name: string; address: string } =>
            typeof point.code === "string" &&
            typeof point.name === "string" &&
            typeof point.address === "string",
        )
        .map((point) => ({
          code: point.code,
          name: point.name,
          address: point.address,
          cityCode,
          cityName: point.city ?? String(cityCode),
        }));
    },

    async quote(input: DeliveryQuoteInput): Promise<DeliveryTariff> {
      const [cheapest] = await tariffs(input);
      if (!cheapest) {
        throw new CdekError(422, "tariff_unavailable");
      }
      return cheapest;
    },

    listTariffs: tariffs,

    async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
      const tariffCode = Number(input.tariffCode);
      if (!Number.isInteger(tariffCode)) {
        throw new CdekError(400, "invalid_tariff_code");
      }

      const body = {
        number: `order-${input.orderId}`,
        tariff_code: tariffCode,
        shipment_point: input.fromPointCode,
        delivery_point: input.toPointCode,
        recipient: {
          name: input.recipientName,
          phones: [{ number: input.recipientPhone }],
        },
        packages: [
          {
            number: "1",
            weight: input.packages.weightG,
            length: input.packages.lengthCm,
            width: input.packages.widthCm,
            height: input.packages.heightCm,
          },
        ],
      };

      const response = await request<CdekResponse>("/v2/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const accepted = response.requests?.[0];
      if (!accepted?.request_uuid) {
        throw new CdekError(502, "order_not_accepted");
      }
      if (accepted.state === "INVALID") {
        throw new CdekError(422, accepted.errors?.[0]?.code ?? "order_invalid");
      }

      const order = await pollOrder(accepted.request_uuid);
      const status = order.statuses?.at(-1);
      return {
        providerOrderId: order.uuid ?? accepted.request_uuid,
        providerNumber: order.cdek_number ?? order.number ?? accepted.request_uuid,
        statusCode: status?.code ?? "ACCEPTED",
        statusName: status?.name ?? "Принят",
        statusDateTime: status?.date_time ?? null,
      };
    },

    async getShipment(providerOrderId: string): Promise<ShipmentState | null> {
      try {
        const response = await request<CdekResponse | CdekOrder>(
          `/v2/orders/${encodeURIComponent(providerOrderId)}`,
        );
        const order = orderFromResponse(response);
        if (!order) {
          return null;
        }
        const status = order.statuses?.at(-1);
        return {
          providerOrderId: order.uuid ?? providerOrderId,
          statusCode: status?.code ?? "UNKNOWN",
          statusName: status?.name ?? "Неизвестно",
          trackNumber: order.cdek_number ?? order.number ?? null,
          statusDateTime: status?.date_time ?? null,
        };
      } catch (error) {
        if (error instanceof CdekError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    async findShipmentByNumber(number: string): Promise<ShipmentState | null> {
      try {
        const response = await request<CdekResponse | CdekOrder | CdekOrder[]>(
          `/v2/orders?im_number=${encodeURIComponent(number)}`,
        );
        const order = Array.isArray(response) ? response[0] : orderFromResponse(response);
        if (!order) {
          return null;
        }
        const status = order.statuses?.at(-1);
        return {
          providerOrderId: order.uuid ?? null,
          statusCode: status?.code ?? "UNKNOWN",
          statusName: status?.name ?? "Неизвестно",
          trackNumber: order.cdek_number ?? order.number ?? null,
          statusDateTime: status?.date_time ?? null,
        };
      } catch (error) {
        if (error instanceof CdekError && (error.status === 400 || error.status === 404)) {
          return null;
        }
        throw error;
      }
    },

    async ensureOrderStatusWebhook(): Promise<void> {
      const response = await request<unknown>("/v2/webhooks");
      const webhooks = asArray<{ type?: string; url?: string }>(response);
      const existing = webhooks.some(
        (webhook) => webhook.type === "ORDER_STATUS" && webhook.url === config.webhookUrl,
      );
      if (existing) {
        return;
      }
      if (webhooks.length >= 2) {
        throw new DeliveryWebhookConflictError();
      }

      await request("/v2/webhooks", {
        method: "POST",
        body: JSON.stringify({ type: "ORDER_STATUS", url: config.webhookUrl }),
      });
    },
  };
}
