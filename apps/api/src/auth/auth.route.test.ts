import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.service.js", () => ({
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
  getUserById: vi.fn(),
}));

import { buildApp } from "../app.js";
import * as authService from "./auth.service.js";
import { SESSION_COOKIE_NAME } from "./session.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const TEST_PHONE = phone("+7", "999", "111", "22", "33");
const RATE_LIMIT_PHONE = phone("+7", "900", "000", "00", "04");
const TEST_USER = { id: 42, phone: TEST_PHONE };

const app = buildApp();

function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  return Array.isArray(value) ? value.join("\n") : String(value ?? "");
}

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(authService.requestCode).mockReset().mockResolvedValue({});
  vi.mocked(authService.verifyCode).mockReset().mockResolvedValue(null);
  vi.mocked(authService.getUserById).mockReset().mockResolvedValue(null);
});

describe("POST /auth/request-code", () => {
  it("normalizes the phone and returns the dev code outside production", async () => {
    vi.mocked(authService.requestCode).mockResolvedValue({ devCode: "123456" });

    const response = await app.inject({
      method: "POST",
      url: "/auth/request-code",
      payload: { phone: phone("8", " (", "999", ") ", "111", "-", "22", "-", "33") },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, devCode: "123456" });
    expect(authService.requestCode).toHaveBeenCalledWith(
      { phone: TEST_PHONE },
      expect.objectContaining({ smsProvider: expect.anything() }),
    );
  });

  it("returns 200 without a dev code when the provider has none", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/request-code",
      payload: { phone: TEST_PHONE },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("returns 400 for an invalid phone and does not send a code", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/request-code",
      payload: { phone: phone("+7", "495", "123", "45", "67") },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
    expect(authService.requestCode).not.toHaveBeenCalled();
  });

  it("returns 429 after five requests per IP and phone", async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/request-code",
        payload: { phone: RATE_LIMIT_PHONE },
      });
      expect(response.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/auth/request-code",
      payload: { phone: RATE_LIMIT_PHONE },
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: "rate_limited" });
    expect(authService.requestCode).toHaveBeenCalledTimes(5);
  });
});

describe("POST /auth/verify-code", () => {
  it("creates a session cookie for a valid code", async () => {
    vi.mocked(authService.verifyCode).mockResolvedValue(TEST_USER);

    const response = await app.inject({
      method: "POST",
      url: "/auth/verify-code",
      payload: { phone: TEST_PHONE, code: "123456" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: TEST_USER });
    expect(authService.verifyCode).toHaveBeenCalledWith({ phone: TEST_PHONE, code: "123456" });

    const cookie = cookieHeader(response);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("returns a generic 401 for a wrong, expired or exhausted code", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/verify-code",
      payload: { phone: TEST_PHONE, code: "654321" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns 400 for a malformed code", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/verify-code",
      payload: { phone: TEST_PHONE, code: "12345" },
    });

    expect(response.statusCode).toBe(400);
    expect(authService.verifyCode).not.toHaveBeenCalled();
  });
});

describe("GET /auth/me", () => {
  it("returns 401 without a session cookie", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns the user for a valid session", async () => {
    vi.mocked(authService.getUserById).mockResolvedValue(TEST_USER);
    const token = app.jwt.sign({ sub: TEST_USER.id });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: TEST_USER });
    expect(authService.getUserById).toHaveBeenCalledWith(TEST_USER.id);
  });

  it("returns 401 for an expired session", async () => {
    const token = app.jwt.sign({ sub: TEST_USER.id }, { expiresIn: -1 });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(authService.getUserById).not.toHaveBeenCalled();
  });

  it("returns 401 when the session user no longer exists", async () => {
    const token = app.jwt.sign({ sub: TEST_USER.id });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("clears the session cookie", async () => {
    const token = app.jwt.sign({ sub: TEST_USER.id });

    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(204);
    const cookie = cookieHeader(response);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);

    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.statusCode).toBe(401);
  });
});
