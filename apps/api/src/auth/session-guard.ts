import type { AuthUser } from "@localhand/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getUserById } from "./auth.service.js";
import { readSessionUserId, SESSION_COOKIE_NAME } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Set by the session guard: `null` before authentication, the user after
     * it. `undefined` only when a handler is invoked without the guard in a test.
     */
    sessionUser?: AuthUser | null;
  }
}

export const UNAUTHORIZED_ERROR = { error: "unauthorized" } as const;

export type SessionUserLookup = (id: number) => Promise<AuthUser | null>;

export type SessionGuardOptions = {
  findUser?: SessionUserLookup;
};

export function sendUnauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send(UNAUTHORIZED_ERROR);
}

/**
 * Shared session guard for seller (and later seller-product) routes.
 *
 * Reads the `lh_session` cookie, verifies the JWT, loads the user and exposes
 * it as `request.sessionUser`. Every failed step is a generic 401: a stale or
 * tampered cookie must not reveal whether a user exists.
 */
export function createSessionGuard(
  app: Pick<FastifyInstance, "jwt">,
  options: SessionGuardOptions = {},
) {
  const findUser = options.findUser ?? getUserById;

  return async function sessionGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    request.sessionUser = null;

    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      sendUnauthorized(reply);
      return;
    }

    let userId: number | null = null;
    try {
      userId = readSessionUserId(app.jwt.verify(token));
    } catch {
      userId = null;
    }
    if (userId === null) {
      sendUnauthorized(reply);
      return;
    }

    const user = await findUser(userId);
    if (!user) {
      sendUnauthorized(reply);
      return;
    }

    request.sessionUser = user;
  };
}

/** Returns the authenticated user or fails loudly when the guard was skipped. */
export function getSessionUser(request: FastifyRequest): AuthUser {
  const user = request.sessionUser;
  if (!user) {
    throw new Error("session guard must run before this handler");
  }
  return user;
}
