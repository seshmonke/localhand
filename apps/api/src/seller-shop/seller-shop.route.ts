import {
  ApiErrorSchema,
  CreateShopSchema,
  SellerShopResponseSchema,
  UpdateShopSchema,
} from "@localhand/shared";
import type { FastifyError } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createSessionGuard, getSessionUser } from "../auth/session-guard.js";
import { createShop, getShopByUserId, updateShop } from "./seller-shop.service.js";

export const sellerShopRoutes: FastifyPluginAsyncZod = async (app) => {
  const sessionGuard = createSessionGuard(app);

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode === 400) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    if (statusCode < 500) {
      return reply
        .code(statusCode)
        .send({ error: statusCode === 401 ? "unauthorized" : "request_failed" });
    }

    request.log.error({ code: error.code ?? "internal_error" }, "seller shop request failed");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get(
    "/seller/shop",
    {
      onRequest: sessionGuard,
      schema: {
        response: {
          200: SellerShopResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const user = getSessionUser(request);

      return { shop: await getShopByUserId(user.id) };
    },
  );

  app.post(
    "/seller/shop",
    {
      onRequest: sessionGuard,
      schema: {
        body: CreateShopSchema,
        response: {
          201: SellerShopResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);

      const result = await createShop(user.id, request.body);
      if (!result.ok) {
        return reply.code(409).send({ error: result.error });
      }

      return reply.code(201).send({ shop: result.shop });
    },
  );

  app.patch(
    "/seller/shop",
    {
      onRequest: sessionGuard,
      schema: {
        body: UpdateShopSchema,
        response: {
          200: SellerShopResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);

      const result = await updateShop(user.id, request.body);
      if (!result.ok) {
        if (result.error === "not_found") {
          return reply.code(404).send({ error: "not_found" });
        }
        if (result.error === "shop_blocked") {
          return reply.code(409).send({ error: "shop_blocked" });
        }
        if (result.error === "shop_city_missing") {
          return reply.code(409).send({ error: "shop_city_missing" });
        }
        return reply.code(409).send({ error: "slug_taken" });
      }

      return { shop: result.shop };
    },
  );
};
