import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";

/**
 * PII/logging guard for the orders path.
 *
 * 1. Source audit: every logging surface in the orders route/service
 *    (`request.log.*`, `app.log.*`, `logger.*`, `log.child`, `log.<level>`)
 *    may carry only an error code, never the request body, phone, comment or
 *    OTP.
 * 2. Runtime error audit: a forced 500 on checkout and on the buyer order
 *    list must answer with a generic error and write no PII into the logger.
 * 3. Runtime success audit: a successful checkout and order read must not log
 *    PII either.
 */
const routeSource = readFileSync(new URL("./orders.route.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("./orders.service.ts", import.meta.url), "utf8");

const LOG_LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);

type LogCall = { method: string; args: string };

/**
 * Finds any `log.<method>` / `logger.<method>` call and extracts its raw
 * argument list. It deliberately matches unknown methods too, so a new
 * `log.child(...)` or a custom logger method cannot bypass the audit.
 */
function logCalls(source: string): LogCall[] {
  const calls: LogCall[] = [];
  const marker = /\b(?:logger|log)\.([A-Za-z_$][\w$]*)\s*\(/g;

  for (const match of source.matchAll(marker)) {
    const method = match[1];
    if (!method) {
      continue;
    }

    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let index = start;

    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
      }
      index += 1;
    }

    calls.push({ method, args: source.slice(start, index - 1) });
  }

  return calls;
}

/** Top-level keys of the first object literal in a log call, if any. */
function payloadKeys(args: string): string[] {
  const object = /^\s*\{([\s\S]*?)\}\s*(?:,|$)/.exec(args);
  if (!object?.[1]) {
    return [];
  }

  return [...object[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map(
    (match) => match[1] ?? "",
  );
}

function expectPayloadKeysSubsetOfCode(payload: unknown): void {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return;
  }

  const keys = Object.keys(payload);
  expect(
    keys.every((key) => key === "code"),
    `log payload keys: ${keys.join(", ")}`,
  ).toBe(true);
}

/**
 * Fastify access logs pass the raw request/reply to the logger; pino's
 * serializers keep only method/url/host/remoteAddress/statusCode. Business log
 * calls must not lean on that behaviour, so the spy audit excludes these two
 * framework shapes.
 */
function isAccessLogPayload(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && ("req" in payload || "res" in payload);
}

const PII_PATTERN = /phone|comment|otp|body|buyerphone/i;

describe("orders source audit", () => {
  it("has exactly one level log call and it carries only an error code", () => {
    const routeCalls = logCalls(routeSource);
    const serviceCalls = logCalls(serviceSource);

    expect(serviceCalls).toEqual([]);
    expect(routeCalls).toHaveLength(1);

    const [call] = routeCalls;
    expect(call?.method).toBe("error");
    expect(call?.args).toMatch(
      /^\s*\{ code: error\.code \?\? "internal_error" \}\s*,\s*"order request failed"\s*$/,
    );
    expect(payloadKeys(call?.args ?? "")).toEqual(["code"]);
    expect(call?.args).not.toMatch(PII_PATTERN);
  });

  it("scans logger.*, log.child and every log.<level> call for PII and payload keys", () => {
    const calls = [...logCalls(routeSource), ...logCalls(serviceSource)];

    for (const call of calls) {
      expect(call.args, `${call.method} args`).not.toMatch(PII_PATTERN);
      expect(LOG_LEVELS.has(call.method) || call.method === "child").toBe(true);

      if (call.method !== "child") {
        for (const key of payloadKeys(call.args)) {
          expect(key, `${call.method} payload key`).toBe("code");
        }
      }
    }

    expect(calls.some((call) => call.method === "child")).toBe(false);
  });

  it("never writes to the console or interpolates a body into logger calls", () => {
    for (const source of [routeSource, serviceSource]) {
      expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug|trace)/);
      expect(source).not.toMatch(
        /(?:logger|log)\.\w+\([^)]*(?:request\.body|buyerPhone|\bcomment\b)/i,
      );
    }
  });
});

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (process.env.CI && !testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required to run the orders log audit in CI");
}

function assertTestDatabase(connectionString: string): void {
  let databaseName: string;

  try {
    databaseName = decodeURIComponent(new URL(connectionString).pathname);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a valid PostgreSQL URL");
  }

  if (!databaseName.includes("_test")) {
    throw new Error(
      'DATABASE_URL_TEST must point to a database whose name contains "_test"; refusing to migrate and truncate it',
    );
  }
}

if (testDatabaseUrl) {
  assertTestDatabase(testDatabaseUrl);
}

const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

type AppModule = typeof import("../app.js");
type DbClientModule = typeof import("../db/client.js");

let appModule!: AppModule;
let app!: ReturnType<AppModule["buildApp"]>;
let dbClient!: DbClientModule;

function phone(...parts: string[]): string {
  return parts.join("");
}

const SELLER_PHONE = phone("+7", "999", "555", "30", "01");
const BUYER_PHONE = phone("+7", "999", "555", "30", "02");
const SUCCESS_SELLER_PHONE = phone("+7", "999", "555", "30", "03");
const SUCCESS_BUYER_PHONE = phone("+7", "999", "555", "30", "04");
const COMMENT = "Секретный комментарий покупателя";
const SUCCESS_COMMENT = "Комментарий успешного заказа";

type Session = { user: { id: number; phone: string }; cookie: string };

function sessionCookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value.join("\n") : String(value ?? "");
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;\\n]+)`).exec(header);
  const token = match?.[1];
  if (!token) {
    throw new Error("verify-code response did not set the session cookie");
  }
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function login(targetPhone: string): Promise<Session & { devCode: string }> {
  const requested = await app.inject({
    method: "POST",
    url: "/auth/request-code",
    payload: { phone: targetPhone },
  });
  expect(requested.statusCode).toBe(200);
  const devCode = requested.json<{ devCode?: string }>().devCode;
  expect(devCode).toMatch(/^\d{6}$/);
  if (!devCode) {
    throw new Error("dev SMS provider did not return a code");
  }

  const verified = await app.inject({
    method: "POST",
    url: "/auth/verify-code",
    payload: { phone: targetPhone, code: devCode },
  });
  expect(verified.statusCode).toBe(200);

  return {
    user: verified.json<{ user: { id: number; phone: string } }>().user,
    cookie: sessionCookieFrom(verified),
    devCode,
  };
}

function request(method: "GET" | "POST" | "PATCH", url: string, cookie: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

async function createPublishedProduct(session: Session, name: string): Promise<number> {
  const created = await request("POST", "/seller/shop", session.cookie, {
    name: "Логи и ПДн",
    slug: "s2-4-logs",
  });
  expect(created.statusCode).toBe(201);

  const publishedShop = await request("PATCH", "/seller/shop", session.cookie, {
    status: "published",
  });
  expect(publishedShop.statusCode).toBe(200);

  const product = await request("POST", "/seller/products", session.cookie, {
    name,
    priceKopecks: 100_000,
  });
  expect(product.statusCode).toBe(201);
  const productId = product.json<{ product: { id: number } }>().product.id;

  const publishedProduct = await request("PATCH", `/seller/products/${productId}`, session.cookie, {
    status: "published",
  });
  expect(publishedProduct.statusCode).toBe(200);

  return productId;
}

const LOG_METHODS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

/**
 * Fail before any request-code if the API would use a real SMS adapter. The
 * vitest config forces SMS_PROVIDER=dev, but this preflight also protects a
 * manually started API or a future config regression.
 */
async function expectDevSmsProvider(): Promise<void> {
  const response = await app.inject({ method: "GET", url: "/health" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ smsProvider: "dev" });
}

describeWithDb("orders logging with a real database", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });

    appModule = await import("../app.js");
    app = appModule.buildApp();
    await app.ready();
    await expectDevSmsProvider();
  });

  afterAll(async () => {
    await app?.close();
    await dbClient?.requirePool().end();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await dbClient
      .requirePool()
      .query(
        "TRUNCATE TABLE order_items, orders, products, shops, sellers, users, otp_codes RESTART IDENTITY CASCADE",
      );
  });

  it("answers 500 without PII in the response or the log when orders storage fails", async () => {
    const seller = await login(SELLER_PHONE);
    const buyer = await login(BUYER_PHONE);
    const productId = await createPublishedProduct(seller, "Пальто");

    // `logger: false` in tests installs abstract-logging, where request.log is
    // the same object as app.log; spying here captures the route's log call.
    const errorSpy = vi.spyOn(app.log, "error");

    try {
      await dbClient.requirePool().query("ALTER TABLE orders RENAME TO orders_e2e_broken");

      const checkoutResponse = await request("POST", "/checkout", buyer.cookie, {
        items: [{ productId }],
        comment: `  ${COMMENT}  `,
        clientCheckoutId: randomUUID(),
      });
      expect(checkoutResponse.statusCode).toBe(500);
      expect(checkoutResponse.json()).toEqual({ error: "internal_error" });

      const ordersResponse = await request("GET", "/orders/mine", buyer.cookie);
      expect(ordersResponse.statusCode).toBe(500);
      expect(ordersResponse.json()).toEqual({ error: "internal_error" });
    } finally {
      await dbClient.requirePool().query("ALTER TABLE orders_e2e_broken RENAME TO orders");
    }

    expect(errorSpy).toHaveBeenCalledTimes(2);
    for (const [payload, message] of errorSpy.mock.calls) {
      expect(payload).toEqual({ code: expect.any(String) });
      expect(Object.keys(payload as Record<string, unknown>).length).toBeGreaterThan(0);
      expectPayloadKeysSubsetOfCode(payload);
      expect(message).toBe("order request failed");
    }

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain(buyer.user.phone);
    expect(logged).not.toContain(COMMENT);
    expect(logged).not.toContain(buyer.devCode);

    errorSpy.mockRestore();

    const restored = await request("GET", "/orders/mine", buyer.cookie);
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toEqual({ orders: [] });
  });

  it("does not write PII to any log level on a successful checkout and order read", async () => {
    const seller = await login(SUCCESS_SELLER_PHONE);
    const buyer = await login(SUCCESS_BUYER_PHONE);
    const productId = await createPublishedProduct(seller, "Куртка успеха");

    // Spying on the root logger of a real pino instance does not see request
    // child loggers, so the success path is measured twice: a spy audit for
    // application-level payloads and the actual pino output (serializers
    // included) through a capturing stream.
    const lines: string[] = [];
    const stream = {
      write(line: string) {
        lines.push(line);
      },
    };
    const loggedApp = appModule.buildApp({ logger: { level: "info", stream } });
    await loggedApp.ready();

    const logSpies = LOG_METHODS.map((method) => vi.spyOn(loggedApp.log, method));
    let applicationCalls: unknown[][] = [];

    try {
      const checkoutResponse = await loggedApp.inject({
        method: "POST",
        url: "/checkout",
        headers: { cookie: buyer.cookie },
        payload: {
          items: [{ productId }],
          comment: `  ${SUCCESS_COMMENT}  `,
          clientCheckoutId: randomUUID(),
        },
      });
      expect(checkoutResponse.statusCode).toBe(201);
      expect(checkoutResponse.json()).toMatchObject({ orders: [{ id: expect.any(Number) }] });

      const mineResponse = await loggedApp.inject({
        method: "GET",
        url: "/orders/mine",
        headers: { cookie: buyer.cookie },
      });
      expect(mineResponse.statusCode).toBe(200);
      expect(mineResponse.json()).toMatchObject({ orders: [{ id: expect.any(Number) }] });

      applicationCalls = logSpies
        .flatMap((spy) => spy.mock.calls)
        .filter(([payload]) => !isAccessLogPayload(payload));
    } finally {
      for (const spy of logSpies) {
        spy.mockRestore();
      }
      await loggedApp.close();
    }

    const output = lines.join("\n");
    expect(output).toContain("incoming request");
    expect(output).not.toContain(buyer.user.phone);
    expect(output).not.toContain(SUCCESS_COMMENT);
    expect(output).not.toContain(buyer.devCode);

    const logged = JSON.stringify(applicationCalls);
    expect(logged).not.toContain(buyer.user.phone);
    expect(logged).not.toContain(SUCCESS_COMMENT);
    expect(logged).not.toContain(buyer.devCode);

    for (const [payload] of applicationCalls) {
      expectPayloadKeysSubsetOfCode(payload);
    }
  });
});
