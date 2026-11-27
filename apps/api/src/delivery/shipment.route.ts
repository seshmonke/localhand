import {
  ApiErrorSchema,
  DeliveryManualTrackSchema,
  DeliveryResponseSchema,
  DeliveryShipmentCreateSchema,
  DeliveryTariffListResponseSchema,
  OrderIdSchema,
} from "@localhand/shared";
import type { FastifyError } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSessionGuard, getSessionUser } from "../auth/session-guard.js";
import {
  createSellerShipment,
  getBuyerDelivery,
  getSellerDelivery,
  handleCdekWebhook,
  listSellerTariffs,
  saveManualTrack,
  type ShipmentError,
} from "./shipment.service.js";

const OrderParamsSchema = z.object({ id: OrderIdSchema });

const WebhookSchema = z.object({
  type: z.literal("ORDER_STATUS"),
  uuid: z.string().min(1).max(64),
  attributes: z
    .object({
      number: z.string().min(1).max(64).optional(),
      cdek_number: z.string().min(1).max(64).optional(),
      code: z.string().min(1).max(64).optional(),
    })
    .optional(),
});

function errorStatus(error: ShipmentError): 404 | 409 | 502 {
  if (error === "not_found") {
    return 404;
  }
  if (error === "delivery_unavailable" || error === "delivery_provider_error") {
    return 502;
  }
  return 409;
}

export const shipmentRoutes: FastifyPluginAsyncZod = async (app) => {
  const sessionGuard = createSessionGuard(app);

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
      return reply
        .code(statusCode)
        .send({ error: statusCode === 401 ? "unauthorized" : "request_failed" });
    }

    request.log.error({ code: error.code ?? "internal_error" }, "delivery shipment failed");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get(
    "/seller/orders/:id/delivery/tariffs",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        response: {
          200: DeliveryTariffListResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const result = await listSellerTariffs(user.id, request.params.id);
      if (!result.ok) {
        return reply.code(errorStatus(result.error)).send({ error: result.error });
      }
      return result.tariffs;
    },
  );

  app.get(
    "/seller/orders/:id/delivery",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        response: {
          200: DeliveryResponseSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const delivery = await getSellerDelivery(user.id, request.params.id);
      if (!delivery) {
        return reply.code(404).send({ error: "not_found" });
      }
      return { delivery };
    },
  );

  app.post(
    "/seller/orders/:id/delivery",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        body: DeliveryShipmentCreateSchema,
        response: {
          200: DeliveryResponseSchema,
          201: DeliveryResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const result = await createSellerShipment(
        user.id,
        request.params.id,
        request.body.tariffCode,
      );
      if (!result.ok) {
        return reply.code(errorStatus(result.error)).send({ error: result.error });
      }
      return reply.code(201).send({ delivery: result.delivery });
    },
  );

  app.patch(
    "/seller/orders/:id/delivery",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        body: DeliveryManualTrackSchema,
        response: {
          200: DeliveryResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const result = await saveManualTrack(user.id, request.params.id, request.body);
      if (!result.ok) {
        return reply.code(errorStatus(result.error)).send({ error: result.error });
      }
      return { delivery: result.delivery };
    },
  );

  app.get(
    "/orders/:id/delivery",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        response: {
          200: DeliveryResponseSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const delivery = await getBuyerDelivery(user.id, request.params.id);
      if (!delivery) {
        return reply.code(404).send({ error: "not_found" });
      }
      return { delivery };
    },
  );

  app.post(
    "/delivery/cdek/webhook",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        body: WebhookSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: ApiErrorSchema,
          404: ApiErrorSchema,
          429: ApiErrorSchema,
          502: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await handleCdekWebhook(request.body);
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 502;
        return reply.code(status).send({ error: result.error });
      }
      return { ok: true as const };
    },
  );
};
