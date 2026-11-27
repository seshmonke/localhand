import {
  ApiErrorSchema,
  CreatePaymentResponseSchema,
  IdempotencyKeySchema,
  IDEMPOTENCY_KEY_HEADER,
  OrderIdSchema,
  OrderPaymentResponseSchema,
  PaymentConnectResponseSchema,
  PaymentErrorSchema,
  SellerPaymentAccountResponseSchema,
} from "@localhand/shared";
import type { FastifyError, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createSessionGuard, getSessionUser } from "../auth/session-guard.js";
import { readSessionUserId, SESSION_COOKIE_NAME } from "../auth/session.js";
import { requireDb } from "../db/client.js";
import { orders, payments } from "../db/schema.js";
import {
  completeSellerPaymentConnection,
  disconnectSellerPaymentAccount,
  getSellerIdByUserId,
  getSellerPaymentAccount,
  startSellerPaymentConnection,
} from "./accounts.service.js";
import { FakePaymentProvider } from "./fake-provider.js";
import {
  createOrderPayment,
  getBuyerOrderPayment,
  getSellerOrderPayment,
} from "./payments.service.js";
import { handlePaymentWebhook } from "./payments.webhook.service.js";
import { PAYMENT_STATE_TTL_MS, verifyPaymentState } from "./state.js";

const OrderParamsSchema = z.object({ id: OrderIdSchema });
const WebhookBodySchema = z
  .object({
    type: z.string().optional(),
    event: z.string().optional(),
    object: z
      .object({
        id: z.string().min(1).max(255),
        status: z.string().max(64).optional(),
      })
      .passthrough(),
  })
  .passthrough();

const CallbackQuerySchema = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(1).max(4096).optional(),
  error: z.string().max(255).optional(),
});

const CREATE_PAYMENT_RATE_LIMIT = {
  max: 5,
  timeWindow: "1 minute",
};

const WEBHOOK_RATE_LIMIT = {
  max: 60,
  timeWindow: "1 minute",
};

export const paymentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const sessionGuard = createSessionGuard(app);
  const db = () => requireDb();

  // Payment responses can carry a confirmation URL tied to the buyer's
  // session; they must never be stored by a browser or an intermediary.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode === 413) {
      return reply.code(413).send({ error: "invalid_request" });
    }
    if (statusCode === 429) {
      return reply.code(429).send({ error: "rate_limited" });
    }
    if (statusCode === 400) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    if (statusCode === 401) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (statusCode === 404) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (statusCode < 500) {
      return reply.code(statusCode).send({ error: "invalid_request" });
    }

    request.log.error({ code: error.code ?? "internal_error" }, "payment request failed");
    return reply.code(500).send({ error: "internal_error" });
  });

  const createRateLimitKey = (request: FastifyRequest): string => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      try {
        const userId = readSessionUserId(app.jwt.verify(token));
        if (userId !== null) {
          return `payments:user:${userId}`;
        }
      } catch {
        // Fall through to the IP key: an invalid session is rejected by the
        // guard before a payment can be created.
      }
    }
    return `payments:ip:${request.ip}`;
  };

  app.post(
    "/seller/payments/connect",
    {
      onRequest: sessionGuard,
      schema: {
        response: {
          200: PaymentConnectResponseSchema,
          400: PaymentErrorSchema,
          401: PaymentErrorSchema,
          403: PaymentErrorSchema,
          404: PaymentErrorSchema,
          409: PaymentErrorSchema,
          502: PaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const runtime = app.payments;
      if (!runtime) {
        return reply.code(409).send({ error: "seller_payment_unavailable" });
      }

      const sellerId = await getSellerIdByUserId(user.id);
      if (sellerId === null) {
        return reply.code(404).send({ error: "not_found" });
      }

      const result = await startSellerPaymentConnection(sellerId, runtime, request.log);
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error });
      }

      return result.value;
    },
  );

  app.get(
    "/seller/payments/callback",
    {
      onRequest: sessionGuard,
      schema: {
        querystring: CallbackQuerySchema,
        response: {
          200: SellerPaymentAccountResponseSchema,
          400: PaymentErrorSchema,
          401: PaymentErrorSchema,
          403: PaymentErrorSchema,
          404: PaymentErrorSchema,
          409: PaymentErrorSchema,
          502: PaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const runtime = app.payments;
      if (!runtime) {
        return reply.code(409).send({ error: "seller_payment_unavailable" });
      }

      const { code, state } = request.query;
      if (!code || !state) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const verified = verifyPaymentState(runtime.settings.stateSecret, state);
      if (!verified) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      if (runtime.consumedStates.has(state)) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const sellerId = await getSellerIdByUserId(user.id);
      if (sellerId === null) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (sellerId !== verified.sellerId) {
        return reply.code(403).send({ error: "invalid_request" });
      }

      const now = Date.now();
      for (const [consumed, expiresAt] of runtime.consumedStates) {
        if (expiresAt <= now) {
          runtime.consumedStates.delete(consumed);
        }
      }
      runtime.consumedStates.set(state, now + PAYMENT_STATE_TTL_MS);

      const result = await completeSellerPaymentConnection({
        sellerId,
        code,
        runtime,
        log: request.log,
      });
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error });
      }

      return { account: result.value };
    },
  );

  app.get(
    "/seller/payments/account",
    {
      onRequest: sessionGuard,
      schema: {
        response: {
          200: SellerPaymentAccountResponseSchema,
          401: PaymentErrorSchema,
        },
      },
    },
    async (request) => {
      const user = getSessionUser(request);
      return { account: await getSellerPaymentAccount(user.id) };
    },
  );

  app.delete(
    "/seller/payments/account",
    {
      onRequest: sessionGuard,
      schema: {
        response: {
          200: SellerPaymentAccountResponseSchema,
          400: PaymentErrorSchema,
          401: PaymentErrorSchema,
          403: PaymentErrorSchema,
          404: PaymentErrorSchema,
          409: PaymentErrorSchema,
          502: PaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const runtime = app.payments;
      if (!runtime) {
        return reply.code(409).send({ error: "seller_payment_unavailable" });
      }

      const result = await disconnectSellerPaymentAccount(user.id, runtime, request.log);
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error });
      }

      return { account: result.value };
    },
  );

  app.post(
    "/orders/:id/payments",
    {
      onRequest: sessionGuard,
      config: {
        rateLimit: {
          ...CREATE_PAYMENT_RATE_LIMIT,
          keyGenerator: createRateLimitKey,
        },
      },
      schema: {
        params: OrderParamsSchema,
        response: {
          200: CreatePaymentResponseSchema,
          201: CreatePaymentResponseSchema,
          400: PaymentErrorSchema,
          401: PaymentErrorSchema,
          404: PaymentErrorSchema,
          409: PaymentErrorSchema,
          429: PaymentErrorSchema,
          502: PaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const idempotency = IdempotencyKeySchema.safeParse(
        request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()],
      );
      if (!idempotency.success) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const runtime = app.payments;
      if (!runtime) {
        return reply.code(409).send({ error: "seller_payment_unavailable" });
      }

      const result = await createOrderPayment({
        userId: user.id,
        orderId: request.params.id,
        idempotencyKey: idempotency.data,
        runtime,
        log: request.log,
      });
      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error });
      }

      return reply.code(result.value.created ? 201 : 200).send({ payment: result.value.payment });
    },
  );

  app.get(
    "/orders/:id/payment",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        response: {
          200: OrderPaymentResponseSchema,
          400: PaymentErrorSchema,
          401: PaymentErrorSchema,
          404: PaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const result = await getBuyerOrderPayment(user.id, request.params.id);
      if (!result.found) {
        return reply.code(404).send({ error: "not_found" });
      }
      return { payment: result.payment };
    },
  );

  app.get(
    "/seller/orders/:id/payment",
    {
      onRequest: sessionGuard,
      schema: {
        params: OrderParamsSchema,
        response: {
          200: OrderPaymentResponseSchema,
          400: PaymentErrorSchema,
          401: PaymentErrorSchema,
          404: PaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);
      const result = await getSellerOrderPayment(user.id, request.params.id);
      if (!result.found) {
        return reply.code(404).send({ error: "not_found" });
      }
      return { payment: result.payment };
    },
  );

  app.post(
    "/payments/yookassa/webhook",
    {
      bodyLimit: 16 * 1024,
      config: { rateLimit: WEBHOOK_RATE_LIMIT },
      schema: {
        body: WebhookBodySchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: ApiErrorSchema,
          413: ApiErrorSchema,
          429: ApiErrorSchema,
          502: PaymentErrorSchema,
          503: PaymentErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const runtime = app.payments;
      if (!runtime) {
        return reply.code(503).send({ error: "provider_unavailable" });
      }

      const result = await handlePaymentWebhook(runtime, request.body.object.id, request.log);
      if (result.status !== 200) {
        return reply.code(result.status).send({ error: "provider_unavailable" });
      }
      return { ok: true as const };
    },
  );

  const fakeRuntime = app.payments;
  const devCompleteEnabled =
    fakeRuntime !== null &&
    fakeRuntime.provider instanceof FakePaymentProvider &&
    fakeRuntime.settings.fakeEnabled &&
    fakeRuntime.settings.environment !== "live";

  if (devCompleteEnabled) {
    app.post(
      "/dev/payments/:id/complete",
      {
        onRequest: sessionGuard,
        schema: {
          params: z.object({ id: OrderIdSchema }),
          response: {
            // Dev-only response: the fake page calls the real webhook with
            // `providerPaymentId` and returns the buyer to `orderId`.
            200: z.object({
              ok: z.literal(true),
              orderId: OrderIdSchema,
              providerPaymentId: z.string().min(1).max(255),
            }),
            400: PaymentErrorSchema,
            401: PaymentErrorSchema,
            404: PaymentErrorSchema,
            409: PaymentErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const user = getSessionUser(request);
        const runtime = app.payments;
        if (!(runtime?.provider instanceof FakePaymentProvider)) {
          return reply.code(404).send({ error: "not_found" });
        }

        const [row] = await db()
          .select({
            id: payments.id,
            orderId: payments.orderId,
            status: payments.status,
            providerPaymentId: payments.providerPaymentId,
            buyerUserId: orders.buyerUserId,
          })
          .from(payments)
          .innerJoin(orders, eq(payments.orderId, orders.id))
          .where(eq(payments.id, request.params.id))
          .limit(1);

        if (!row || row.buyerUserId !== user.id) {
          return reply.code(404).send({ error: "not_found" });
        }
        if (row.status !== "pending" || !row.providerPaymentId) {
          return reply.code(409).send({ error: "invalid_order_transition" });
        }

        runtime.provider.completePayment(row.providerPaymentId);
        return {
          ok: true as const,
          orderId: row.orderId,
          providerPaymentId: row.providerPaymentId,
        };
      },
    );
  }
};
