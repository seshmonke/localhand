import {
  ApiErrorSchema,
  CreateProductSchema,
  ProductIdSchema,
  SellerProductListResponseSchema,
  SellerProductResponseSchema,
  UpdateProductSchema,
} from "@localhand/shared";
import type { FastifyError } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSessionGuard, getSessionUser } from "../auth/session-guard.js";
import {
  createProduct,
  listSellerProducts,
  updateSellerProduct,
} from "./seller-product.service.js";

const ProductParamsSchema = z.object({ id: ProductIdSchema });

export const sellerProductRoutes: FastifyPluginAsyncZod = async (app) => {
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

    request.log.error({ code: error.code ?? "internal_error" }, "seller product request failed");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get(
    "/seller/products",
    {
      onRequest: sessionGuard,
      schema: {
        response: {
          200: SellerProductListResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const user = getSessionUser(request);

      return { products: await listSellerProducts(user.id) };
    },
  );

  app.post(
    "/seller/products",
    {
      onRequest: sessionGuard,
      schema: {
        body: CreateProductSchema,
        response: {
          201: SellerProductResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);

      const result = await createProduct(user.id, request.body);
      if (!result.ok) {
        return reply.code(409).send({ error: result.error });
      }

      return reply.code(201).send({ product: result.product });
    },
  );

  app.patch(
    "/seller/products/:id",
    {
      onRequest: sessionGuard,
      schema: {
        params: ProductParamsSchema,
        body: UpdateProductSchema,
        response: {
          200: SellerProductResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = getSessionUser(request);

      const result = await updateSellerProduct(user.id, request.params.id, request.body);
      if (!result.ok) {
        if (result.error === "not_found") {
          return reply.code(404).send({ error: "not_found" });
        }
        return reply.code(409).send({ error: result.error });
      }

      return { product: result.product };
    },
  );
};
