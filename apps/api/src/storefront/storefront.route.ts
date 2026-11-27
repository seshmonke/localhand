import {
  ApiErrorSchema,
  CatalogQuerySchema,
  CatalogResponseSchema,
  ProductDetailSchema,
  ShopPageSchema,
} from "@localhand/shared";
import type { FastifyError } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  getPublishedProduct,
  getPublishedShop,
  listPublishedProducts,
} from "./storefront.service.js";

const ShopParamsSchema = z.object({ slug: z.string().min(1) });
const ProductParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(2_147_483_647),
});

export const storefrontRoutes: FastifyPluginAsyncZod = async (app) => {
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
        .send({ error: statusCode === 404 ? "not_found" : "request_failed" });
    }

    request.log.error({ code: error.code ?? "internal_error" }, "storefront request failed");
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get(
    "/catalog/products",
    {
      schema: {
        querystring: CatalogQuerySchema,
        response: {
          200: CatalogResponseSchema,
          400: ApiErrorSchema,
        },
      },
    },
    async (request) => listPublishedProducts(request.query),
  );

  app.get(
    "/shops/:slug",
    {
      schema: {
        params: ShopParamsSchema,
        response: {
          200: ShopPageSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const shop = await getPublishedShop(request.params.slug);
      if (!shop) {
        return reply.code(404).send({ error: "not_found" });
      }
      return shop;
    },
  );

  app.get(
    "/products/:id",
    {
      schema: {
        params: ProductParamsSchema,
        response: {
          200: ProductDetailSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const product = await getPublishedProduct(request.params.id);
      if (!product) {
        return reply.code(404).send({ error: "not_found" });
      }
      return product;
    },
  );
};
