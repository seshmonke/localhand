import {
  ApiErrorSchema,
  DeliveryCityListResponseSchema,
  DeliveryPointListResponseSchema,
  DeliveryQuoteRequestSchema,
  DeliveryQuoteResponseSchema,
} from "@localhand/shared";
import type { FastifyError } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { listDeliveryCities, listDeliveryPoints, quoteDelivery } from "./delivery.service.js";

const QUOTE_RATE_LIMIT = {
  max: 30,
  timeWindow: "1 minute",
};

const CitiesQuerySchema = z.object({
  query: z.string().trim().max(80).optional().default(""),
});

const PointsQuerySchema = z.object({
  cityCode: z.coerce.number().int().positive().max(2_147_483_647),
});

export const deliveryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode === 429) {
      return reply.code(429).send({ error: "rate_limited" });
    }
    if (statusCode === 400) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    if (statusCode < 500) {
      return reply.code(statusCode).send({ error: "request_failed" });
    }

    request.log.error({ code: error.code ?? "internal_error" }, "delivery request failed");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get(
    "/delivery/cities",
    {
      config: { rateLimit: QUOTE_RATE_LIMIT },
      schema: {
        querystring: CitiesQuerySchema,
        response: {
          200: DeliveryCityListResponseSchema,
          400: ApiErrorSchema,
          429: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const cities = await listDeliveryCities(request.query.query);
      if (!cities) {
        return reply.code(502).send({ error: "delivery_unavailable" });
      }
      return { cities };
    },
  );

  app.get(
    "/delivery/points",
    {
      config: { rateLimit: QUOTE_RATE_LIMIT },
      schema: {
        querystring: PointsQuerySchema,
        response: {
          200: DeliveryPointListResponseSchema,
          400: ApiErrorSchema,
          429: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const points = await listDeliveryPoints(request.query.cityCode);
      if (!points) {
        return reply.code(502).send({ error: "delivery_unavailable" });
      }
      return { points };
    },
  );

  app.post(
    "/delivery/quote",
    {
      config: { rateLimit: QUOTE_RATE_LIMIT },
      schema: {
        body: DeliveryQuoteRequestSchema,
        response: {
          200: DeliveryQuoteResponseSchema,
          400: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await quoteDelivery(request.body);
      if (!result.ok) {
        return reply
          .code(result.error === "delivery_unavailable" ? 502 : 409)
          .send({ error: result.error });
      }
      return result.quote;
    },
  );
};
