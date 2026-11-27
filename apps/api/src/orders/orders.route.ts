import {
  ApiErrorSchema,
  CheckoutResponseSchema,
  CheckoutSchema,
  OrderIdSchema,
  OrderListResponseSchema,
  OrderResponseSchema,
} from "@localhand/shared";
import type { FastifyError, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSessionGuard, getSessionUser } from "../auth/session-guard.js";
import {
  checkout,
  getBuyerOrder,
  getSellerOrder,
  listBuyerOrders,
  listSellerOrders,
} from "./orders.service.js";

const OrderParamsSchema = z.object({ id: OrderIdSchema });

const CHECKOUT_RATE_LIMIT = {
  max: 10,
  timeWindow: "1 minute",
  keyGenerator: (request: FastifyRequest) =>
    `checkout:user:${request.sessionUser?.id ?? request.ip}`,
};

export const ordersRoutes: FastifyPluginAsyncZod = async (app) => {
  const sessionGuard = createSessionGuard(app);

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

    request.log.error({ code: error.code ?? "internal_error" }, "order request failed");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.post(
    "/checkout",
    {
      onRequest: sessionGuard,
      config: { rateLimit: CHECKOUT_RATE_LIMIT },
      schema: {
        body: CheckoutSchema,
        response: {
          201: CheckoutResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);

      const result = await checkout(user, request.body);
      if (!result.ok) {
        return reply.code(409).send({ error: "product_unavailable" });
      }

      return reply.code(201).send({ orders: result.orders });
    },
  );

  app.get(
    "/orders/mine",
    {
      onRequest: sessionGuard,
      schema: {
        response: {
          200: OrderListResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const user = getSessionUser(request);

      return { orders: await listBuyerOrders(user.id) };
    },
  );

  app.get(
    "/orders/:id",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        response: {
          200: OrderResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);

      const order = await getBuyerOrder(user.id, request.params.id);
      if (!order) {
        return reply.code(404).send({ error: "not_found" });
      }

      return { order };
    },
  );

  app.get(
    "/seller/orders",
    {
      onRequest: sessionGuard,
      schema: {
        response: {
          200: OrderListResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const user = getSessionUser(request);

      return { orders: await listSellerOrders(user.id) };
    },
  );

  app.get(
    "/seller/orders/:id",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        response: {
          200: OrderResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);

      const order = await getSellerOrder(user.id, request.params.id);
      if (!order) {
        return reply.code(404).send({ error: "not_found" });
      }

      return { order };
    },
  );
};
