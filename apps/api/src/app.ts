import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { authRoutes } from "./auth/auth.route.js";
import { createSmsProvider } from "./auth/sms/sms-provider.js";
import { deliveryRoutes } from "./delivery/delivery.route.js";
import { env, jwtSecret, paymentsSettings, trustProxy, type TrustProxyConfig } from "./env.js";
import { healthRoutes } from "./health/health.route.js";
import { ordersRoutes } from "./orders/orders.route.js";
import { createPaymentsRuntime } from "./payments/context.js";
import { resolveFastifyLogger } from "./payments/log-redaction.js";
import type { PaymentProvider } from "./payments/provider.js";
import { startPaymentsReconcile } from "./payments/payments.reconcile.scheduler.js";
import { paymentsRoutes } from "./payments/payments.route.js";
import { sellerProductRoutes } from "./seller-product/seller-product.route.js";
import { sellerShopRoutes } from "./seller-shop/seller-shop.route.js";
import { storefrontRoutes } from "./storefront/storefront.route.js";

export type BuildAppOptions = {
  trustProxy?: TrustProxyConfig;
  /** Test hook: capture the real pino output (serializers included). */
  logger?: FastifyServerOptions["logger"];
  /** Test hook: replace the provider while keeping one instance per app. */
  paymentProvider?: PaymentProvider;
  /** Test hook: disable the 60s reconcile scheduler (it runs on every startup otherwise). */
  reconcile?: boolean;
  /** Test hook: shorten the 10s provider timeout. */
  paymentProviderTimeoutMs?: number;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: resolveFastifyLogger(env.NODE_ENV, options.logger),
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

  const payments = createPaymentsRuntime({
    settings: paymentsSettings,
    webOrigin: env.WEB_ORIGIN,
    ...(options.paymentProvider === undefined ? {} : { provider: options.paymentProvider }),
    ...(options.paymentProviderTimeoutMs === undefined
      ? {}
      : { providerTimeoutMs: options.paymentProviderTimeoutMs }),
  });
  app.decorate("payments", payments);

  app.register(healthRoutes);
  app.register(storefrontRoutes);
  app.register(authRoutes, { smsProvider });
  app.register(sellerShopRoutes);
  app.register(sellerProductRoutes);
  app.register(deliveryRoutes);
  app.register(ordersRoutes);
  app.register(paymentsRoutes);

  const reconcileEnabled =
    options.reconcile ?? (env.NODE_ENV !== "test" && env.DATABASE_URL !== undefined);
  if (payments && reconcileEnabled) {
    const scheduler = startPaymentsReconcile(app, payments);
    app.addHook("onReady", async () => {
      scheduler.runNow();
    });
  }

  return app;
}
