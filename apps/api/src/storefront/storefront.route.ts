import {
  ApiErrorSchema,
  ProductDetailSchema,
  ProductListResponseSchema,
  ShopPageSchema,
} from "@localhand/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  getPublishedProduct,
  getPublishedShop,
  listPublishedProducts,
} from "./storefront.service.js";

const ShopParamsSchema = z.object({ slug: z.string().min(1) });
const ProductParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const storefrontRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/catalog/products",
    {
      schema: {
        response: {
          200: ProductListResponseSchema,
        },
      },
    },
    async () => ({ products: await listPublishedProducts() }),
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
