import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./env.js";
import { healthRoutes } from "./health/health.route.js";
import { storefrontRoutes } from "./storefront/storefront.route.js";

export function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(helmet);
  app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  app.register(rateLimit, { global: false });

  app.register(healthRoutes);
  app.register(storefrontRoutes);

  return app;
}
