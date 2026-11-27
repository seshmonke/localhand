import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../auth/session.js";

/**
 * PII/logging guard for the orders path.
 *
 * 1. Source audit: the orders route/service may log only an error code, never
 *    the request body, phone, comment or OTP.
 * 2. Runtime audit: a forced 500 on checkout and on the buyer order list must
 *    answer with a generic error and write no PII into the logger.
 */
const routeSource = readFileSync(new URL("./orders.route.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("./orders.service.ts", import.meta.url), "utf8");

function logCalls(source: string): string[] {
  const calls: string[] = [];
  const marker = /\blog\.(?:trace|debug|info|warn|error|fatal)\s*\(/g;

  for (const match of source.matchAll(marker)) {
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

    calls.push(source.slice(start, index - 1));
  }

  return calls;
}

const PII_PATTERN = /phone|comment|otp|body|buyerphone/i;

describe("orders source audit", () => {
  it("has exactly one log call and it carries only an error code", () => {
    const routeCalls = logCalls(routeSource);
    const serviceCalls = logCalls(serviceSource);

    expect(serviceCalls).toEqual([]);
    expect(routeCalls).toEqual([
      expect.stringMatching(
        /^\s*\{ code: error\.code \?\? "internal_error" \}\s*,\s*"order request failed"\s*$/,
      ),
    ]);
    expect(routeCalls.join("\n")).not.toMatch(PII_PATTERN);
  });

  it("never writes to the console or interpolates a request body into a log", () => {
    for (const source of [routeSource, serviceSource]) {
      expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug|trace)/);
      expect(source).not.toMatch(/log\.\w+\([^)]*(?:request\.body|buyerPhone|\bcomment\b)/);
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
const COMMENT = "Секретный комментарий покупателя";

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
  });

  afterAll(async () => {
    await app?.close();
    await dbClient?.requirePool().end();
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
      expect(Object.keys(payload as Record<string, unknown>)).toEqual(["code"]);
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
});
