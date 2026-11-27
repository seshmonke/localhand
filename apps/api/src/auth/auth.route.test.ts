import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const VERIFY_LIMIT_PHONE = phone("+7", "902", "000", "00", "05");
const TEST_USER = { id: 42, phone: TEST_PHONE };

function uniquePhone(index: number): string {
  return phone("+7", "901", "000", String(index).padStart(4, "0"));
}

const authSourceDir = fileURLToPath(new URL(".", import.meta.url));
const LOG_CALL_PATTERN = /\b(?:request|reply|app|log)\.(?:trace|debug|info|warn|error|fatal)\s*\(/g;

async function listAuthSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAuthSourceFiles(fullPath)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

/** Returns the raw argument text of every `log.<level>(...)` call in a file. */
function extractLogArguments(source: string): string[] {
  const calls: string[] = [];

  for (const match of source.matchAll(LOG_CALL_PATTERN)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let quote: string | null = null;
    let escaped = false;
    let end = source.length;

    for (let index = start; index < source.length; index += 1) {
      const character = source[index] ?? "";

      if (quote !== null) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }

      if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }

    calls.push(source.slice(start, end));
  }

  return calls;
}

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

  it("returns 429 after five requests for one phone across different IPs", async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/request-code",
        payload: { phone: RATE_LIMIT_PHONE },
        remoteAddress: `203.0.113.${index + 1}`,
      });
      expect(response.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/auth/request-code",
      payload: { phone: RATE_LIMIT_PHONE },
      remoteAddress: "203.0.113.99",
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: "rate_limited" });
    expect(authService.requestCode).toHaveBeenCalledTimes(5);
  });

  it("returns 429 after twenty requests from one IP even with spoofed X-Forwarded-For", async () => {
    const isolatedApp = buildApp();
    await isolatedApp.ready();

    try {
      for (let index = 0; index < 20; index += 1) {
        const response = await isolatedApp.inject({
          method: "POST",
          url: "/auth/request-code",
          payload: { phone: uniquePhone(index) },
          headers: { "x-forwarded-for": `198.51.100.${index + 1}` },
        });
        expect(response.statusCode).toBe(200);
      }

      const blocked = await isolatedApp.inject({
        method: "POST",
        url: "/auth/request-code",
        payload: { phone: uniquePhone(20) },
        headers: { "x-forwarded-for": "198.51.100.99" },
      });

      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({ error: "rate_limited" });
      expect(authService.requestCode).toHaveBeenCalledTimes(20);
    } finally {
      await isolatedApp.close();
    }
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

  it("returns 429 after ten attempts per IP and phone", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/verify-code",
        payload: { phone: VERIFY_LIMIT_PHONE, code: "654321" },
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/auth/verify-code",
      payload: { phone: VERIFY_LIMIT_PHONE, code: "654321" },
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: "rate_limited" });
    expect(authService.verifyCode).toHaveBeenCalledTimes(10);
  });

  it("normalizes IPv6 variants in the verify-code limiter key", async () => {
    const ipv6Phone = phone("+7", "902", "000", "00", "06");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/verify-code",
        payload: { phone: ipv6Phone, code: "654321" },
        remoteAddress: "2001:db8:0:1::1",
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/auth/verify-code",
      payload: { phone: ipv6Phone, code: "654321" },
      remoteAddress: "2001:db8:0:1:0:0:0:1",
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: "rate_limited" });
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

describe("trustProxy", () => {
  it("uses X-Forwarded-For from the trusted Caddy peer", async () => {
    const trustedApp = buildApp({ trustProxy: "172.28.0.2/32" });
    await trustedApp.ready();

    try {
      for (let index = 0; index < 20; index += 1) {
        const response = await trustedApp.inject({
          method: "POST",
          url: "/auth/request-code",
          payload: { phone: uniquePhone(index) },
          remoteAddress: "172.28.0.2",
          headers: { "x-forwarded-for": "203.0.113.1" },
        });
        expect(response.statusCode).toBe(200);
      }

      const otherClient = await trustedApp.inject({
        method: "POST",
        url: "/auth/request-code",
        payload: { phone: uniquePhone(20) },
        remoteAddress: "172.28.0.2",
        headers: { "x-forwarded-for": "203.0.113.2" },
      });
      expect(otherClient.statusCode).toBe(200);

      const blocked = await trustedApp.inject({
        method: "POST",
        url: "/auth/request-code",
        payload: { phone: uniquePhone(21) },
        remoteAddress: "172.28.0.2",
        headers: { "x-forwarded-for": "203.0.113.1" },
      });

      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({ error: "rate_limited" });
      expect(authService.requestCode).toHaveBeenCalledTimes(21);
    } finally {
      await trustedApp.close();
    }
  });

  it("ignores X-Forwarded-For from peers outside the trusted CIDR", async () => {
    const caddyOnlyApp = buildApp({ trustProxy: "172.28.0.2/32" });
    await caddyOnlyApp.ready();

    try {
      for (let index = 0; index < 20; index += 1) {
        const response = await caddyOnlyApp.inject({
          method: "POST",
          url: "/auth/request-code",
          payload: { phone: uniquePhone(index) },
          remoteAddress: "127.0.0.1",
          headers: { "x-forwarded-for": `198.51.100.${index + 1}` },
        });
        expect(response.statusCode).toBe(200);
      }

      const blocked = await caddyOnlyApp.inject({
        method: "POST",
        url: "/auth/request-code",
        payload: { phone: uniquePhone(20) },
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": "198.51.100.99" },
      });

      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({ error: "rate_limited" });
      expect(authService.requestCode).toHaveBeenCalledTimes(20);
    } finally {
      await caddyOnlyApp.close();
    }
  });
});

describe("auth error logging", () => {
  it("logs only the error code, never the phone or the OTP code, on a 500", async () => {
    const logged: unknown[][] = [];
    const errorSpy = vi.spyOn(app.log, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    const failingPhone = phone("+7", "903", "000", "00", "07");
    const otpCode = "314159";
    const failure = Object.assign(
      new Error(`request-code failed for ${failingPhone} with code ${otpCode}`),
      { statusCode: 500, code: "db_unavailable" },
    );
    vi.mocked(authService.requestCode).mockRejectedValue(failure);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/auth/request-code",
        payload: { phone: failingPhone },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "internal_error" });
      expect(logged).toEqual([[{ code: "db_unavailable" }, "auth request failed"]]);

      const serialized = JSON.stringify(logged);
      expect(serialized).not.toContain(failingPhone);
      expect(serialized).not.toContain(otpCode);
      expect(serialized).not.toContain(failure.message);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("does not log phone numbers or OTP codes from the auth sources", async () => {
    const files = await listAuthSourceFiles(authSourceDir);
    expect(files.length).toBeGreaterThan(0);

    let foundCalls = 0;
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const argumentsText of extractLogArguments(source)) {
        foundCalls += 1;
        // `error.code` is a diagnostic code, not the OTP code. Strip it and
        // the `code:` object key, then reject any remaining PII identifier.
        const withoutErrorCodes = argumentsText
          .replace(/\b(?:error|err|cause)\.code\b/g, "")
          .replace(/\bcode\s*:/g, "");
        expect(withoutErrorCodes, `${path.basename(file)}: ${argumentsText}`).not.toMatch(
          /\b(?:phone|devCode|code)\b/,
        );
      }
    }

    expect(foundCalls).toBeGreaterThan(0);
  });
});
