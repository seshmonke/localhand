import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { authRoutes } from "./auth/auth.route.js";
import { createSmsProvider } from "./auth/sms/sms-provider.js";
import { env, jwtSecret, trustProxy, type TrustProxyConfig } from "./env.js";
import { healthRoutes } from "./health/health.route.js";
import { sellerProductRoutes } from "./seller-product/seller-product.route.js";
import { sellerShopRoutes } from "./seller-shop/seller-shop.route.js";
import { storefrontRoutes } from "./storefront/storefront.route.js";

export type BuildAppOptions = {
  trustProxy?: TrustProxyConfig;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    trustProxy: options.trustProxy ?? trustProxy,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(helmet);
  app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  app.register(cookie);
  app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: "7d" },
  });
  app.register(rateLimit, {
    global: false,
  });

  const smsProvider = createSmsProvider({
    nodeEnv: env.NODE_ENV,
    provider: env.SMS_PROVIDER,
    smsruApiId: env.SMSRU_API_ID,
  });

  app.register(healthRoutes);
  app.register(storefrontRoutes);
  app.register(authRoutes, { smsProvider });
  app.register(sellerShopRoutes);
  app.register(sellerProductRoutes);

  return app;
}
