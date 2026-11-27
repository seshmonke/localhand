import type { FastifyServerOptions } from "fastify";
import type { AppNodeEnv } from "../env.js";

/** The only route that carries OAuth secrets in its query string. */
export const PAYMENTS_CALLBACK_PATH = "/seller/payments/callback";

type RequestLike = {
  method?: string;
  url?: string;
  host?: string;
  ip?: string;
};

/**
 * Fastify's access log receives the raw `req` object, including `req.url`.
 * The OAuth callback URL contains the one-time `code` and signed `state`;
 * logging it would put both secrets into the log stream. Strip the query for
 * that path and keep the original URL elsewhere.
 */
export function paymentRequestSerializer(request: unknown) {
  const value = (request ?? {}) as RequestLike;
  const rawUrl = value.url ?? "";
  const [pathname = rawUrl] = rawUrl.split("?");
  return {
    method: value.method,
    url: pathname === PAYMENTS_CALLBACK_PATH ? pathname : rawUrl,
    host: value.host,
    remoteAddress: value.ip,
  };
}

/**
 * Production keeps structured access logs with the safe request serializer;
 * tests keep the existing silent logger unless they pass their own.
 */
export function resolveFastifyLogger(
  nodeEnv: AppNodeEnv,
  logger: FastifyServerOptions["logger"] | undefined,
): FastifyServerOptions["logger"] {
  if (logger === true) {
    // Explicit default logger still must not leak the OAuth callback query.
    return { serializers: { req: paymentRequestSerializer } };
  }
  if (logger !== undefined) {
    return logger;
  }
  if (nodeEnv === "test") {
    return false;
  }
  return { serializers: { req: paymentRequestSerializer } };
}
