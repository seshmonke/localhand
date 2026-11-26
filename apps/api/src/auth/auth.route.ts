import {
  ApiErrorSchema,
  MeResponseSchema,
  RequestCodeResponseSchema,
  RequestCodeSchema,
  VerifyCodeResponseSchema,
  VerifyCodeSchema,
} from "@localhand/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { env } from "../env.js";
import { getUserById, requestCode, verifyCode } from "./auth.service.js";
import { readSessionUserId, SESSION_COOKIE_NAME, sessionCookieOptions } from "./session.js";
import type { SmsProvider } from "./sms/sms-provider.js";

type AuthRoutesOptions = {
  smsProvider: SmsProvider;
};

const unauthorized = { error: "unauthorized" } as const;

function sendUnauthorized(reply: FastifyReply) {
  return reply.code(401).send(unauthorized);
}

type RateLimitCheck = (
  request: FastifyRequest,
) => Promise<{ isAllowed: true } | { isAllowed: false; isExceeded: boolean }>;

function enforceRateLimit(check: RateLimitCheck) {
  return async (request: FastifyRequest) => {
    const result = await check(request);
    if (!result.isAllowed && result.isExceeded) {
      throw Object.assign(new Error("rate limit exceeded"), { statusCode: 429 });
    }
  };
}

function requestPhone(request: FastifyRequest): string {
  const body = request.body as { phone?: unknown } | null | undefined;
  return typeof body === "object" && body !== null && typeof body.phone === "string"
    ? body.phone
    : "invalid";
}

function phoneKey(request: FastifyRequest): string {
  return requestPhone(request);
}

function ipPhoneKey(request: FastifyRequest): string {
  return `${request.ip}:${requestPhone(request)}`;
}

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const cookieOptions = sessionCookieOptions(env.NODE_ENV);

  const phoneCodeLimiter = enforceRateLimit(
    app.createRateLimit({ max: 5, timeWindow: "1 minute", keyGenerator: phoneKey }),
  );
  const ipCodeLimiter = enforceRateLimit(app.createRateLimit({ max: 20, timeWindow: "1 minute" }));
  const verifyCodeLimiter = enforceRateLimit(
    app.createRateLimit({ max: 10, timeWindow: "1 minute", keyGenerator: ipPhoneKey }),
  );

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    if (error.validation) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    if (statusCode === 429) {
      return reply.code(429).send({ error: "rate_limited" });
    }
    if (statusCode >= 500) {
      request.log.error({ code: error.code ?? "internal_error" }, "auth request failed");
      return reply.code(500).send({ error: "internal_error" });
    }
    return reply.code(statusCode).send({ error: "request_failed" });
  });

  app.post(
    "/auth/request-code",
    {
      preHandler: [phoneCodeLimiter, ipCodeLimiter],
      schema: {
        body: RequestCodeSchema,
        response: {
          200: RequestCodeResponseSchema,
          400: ApiErrorSchema,
          429: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const result = await requestCode(
        { phone: request.body.phone },
        { smsProvider: options.smsProvider },
      );

      if (result.devCode) {
        return { ok: true as const, devCode: result.devCode };
      }
      return { ok: true as const };
    },
  );

  app.post(
    "/auth/verify-code",
    {
      preHandler: [verifyCodeLimiter],
      schema: {
        body: VerifyCodeSchema,
        response: {
          200: VerifyCodeResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await verifyCode({
        phone: request.body.phone,
        code: request.body.code,
      });

      if (!user) {
        return sendUnauthorized(reply);
      }

      const token = app.jwt.sign({ sub: user.id });
      reply.setCookie(SESSION_COOKIE_NAME, token, cookieOptions);
      return { user };
    },
  );

  app.get(
    "/auth/me",
    {
      schema: {
        response: {
          200: MeResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE_NAME];
      if (!token) {
        return sendUnauthorized(reply);
      }

      let userId: number | null = null;
      try {
        userId = readSessionUserId(app.jwt.verify(token));
      } catch {
        userId = null;
      }
      if (userId === null) {
        return sendUnauthorized(reply);
      }

      const user = await getUserById(userId);
      if (!user) {
        return sendUnauthorized(reply);
      }

      return { user };
    },
  );

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    return reply.code(204).send();
  });
};
