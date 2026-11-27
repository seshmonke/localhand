import { HealthResponseSchema } from "@localhand/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { env } from "../env.js";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async () => ({
      status: "ok" as const,
      service: "localhand-api" as const,
      version: "0.0.0",
      smsProvider: env.SMS_PROVIDER,
    }),
  );
};
