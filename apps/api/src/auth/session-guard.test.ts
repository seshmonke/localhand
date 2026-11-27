import type { AuthUser } from "@localhand/shared";
import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createSessionGuard, getSessionUser } from "./session-guard.js";
import { SESSION_COOKIE_NAME } from "./session.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const TEST_USER: AuthUser = { id: 42, phone: phone("+7", "999", "111", "22", "33") };

const app = buildApp();
const findUser = vi.fn<(id: number) => Promise<AuthUser | null>>(async () => null);

app.get("/test/session", { onRequest: createSessionGuard(app, { findUser }) }, async (request) => ({
  user: request.sessionUser ?? null,
}));

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  findUser.mockReset().mockResolvedValue(null);
});

describe("session guard", () => {
  it("returns 401 without a session cookie", async () => {
    const response = await app.inject({ method: "GET", url: "/test/session" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(findUser).not.toHaveBeenCalled();
  });

  it("returns 401 for a malformed or expired token", async () => {
    const expired = app.jwt.sign({ sub: TEST_USER.id }, { expiresIn: -1 });

    for (const token of ["not-a-jwt", expired]) {
      const response = await app.inject({
        method: "GET",
        url: "/test/session",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    }

    expect(findUser).not.toHaveBeenCalled();
  });

  it("returns 401 for a token without a usable subject", async () => {
    const token = app.jwt.sign({ sub: "admin" });

    const response = await app.inject({
      method: "GET",
      url: "/test/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(findUser).not.toHaveBeenCalled();
  });

  it("returns 401 when the session user no longer exists", async () => {
    const token = app.jwt.sign({ sub: TEST_USER.id });

    const response = await app.inject({
      method: "GET",
      url: "/test/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(findUser).toHaveBeenCalledWith(TEST_USER.id);
  });

  it("exposes the user for a valid session", async () => {
    findUser.mockResolvedValue(TEST_USER);
    const token = app.jwt.sign({ sub: TEST_USER.id });

    const response = await app.inject({
      method: "GET",
      url: "/test/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: TEST_USER });
    expect(findUser).toHaveBeenCalledWith(TEST_USER.id);
  });

  it("fails loudly when a handler runs without the guard", () => {
    expect(() => getSessionUser({} as FastifyRequest)).toThrow(
      "session guard must run before this handler",
    );
  });
});
