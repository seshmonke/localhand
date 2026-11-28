import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryProvider, ShipmentState } from "./provider.js";

/**
 * PII guard for the delivery reconcile logs.
 *
 * The provider may echo a recipient name, phone or address in an error
 * message, response body or `cause`. A raw `err: error` makes pino serialize
 * `message`/`stack`, so only a safe `{ name, code? }` snapshot may reach the
 * logger.
 */
const PII_NAME = "Иван Тестов";
const PII_ADDRESS = "Невский проспект, 1";

// Split like the other log-audit fixtures so the public-repo scan does not
// treat the fictional test phone as a real phone number.
function phone(...parts: string[]): string {
  return parts.join("");
}

const PII_PHONE = phone("+7", "999", "000", "00", "00");

const state = vi.hoisted(() => ({
  candidates: [] as Array<{ id: number; orderId: number; providerOrderId: string | null }>,
  transactionError: null as Error | null,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("../db/client.js", () => ({
  requireDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => state.candidates,
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
    transaction: async (_callback: (tx: unknown) => Promise<void>) => {
      if (state.transactionError) {
        throw state.transactionError;
      }
      throw new Error("the provider-error path must not open a transaction");
    },
  }),
}));

const { runDeliveryReconcile } = await import("./delivery.reconcile.js");

const NOW = new Date("2026-11-28T12:00:00.000Z");

function captureLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

type CapturedLogger = ReturnType<typeof captureLogger>;

function loggedCalls(log: CapturedLogger): unknown[][] {
  return [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls];
}

/** Includes both pino arguments: the payload object and the log message. */
function loggedPayloads(log: CapturedLogger): unknown[] {
  return loggedCalls(log).flat();
}

/** Serializes the captured calls the way pino's error serializer would. */
function pinoOutput(log: CapturedLogger): string {
  return JSON.stringify(loggedPayloads(log), (_key, value: unknown) => {
    if (value instanceof Error) {
      return { type: value.name, message: value.message, stack: value.stack };
    }
    return value;
  });
}

/** Finds a raw Error at any depth, including `cause` and other nested fields. */
function rawErrorPaths(value: unknown, path = "log"): string[] {
  if (value instanceof Error) {
    return [path];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => rawErrorPaths(item, `${path}[${index}]`));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => rawErrorPaths(child, `${path}.${key}`));
}

function expectNoPii(log: CapturedLogger): void {
  const output = pinoOutput(log);
  expect(output).not.toContain(PII_NAME);
  expect(output).not.toContain(PII_PHONE);
  expect(output).not.toContain(PII_ADDRESS);
  expect(rawErrorPaths(loggedPayloads(log))).toEqual([]);
  for (const payload of loggedPayloads(log)) {
    if (typeof payload !== "object" || payload === null) {
      continue;
    }
    const record = payload as Record<string, unknown>;
    expect(record).not.toHaveProperty("err.message");
    expect(record).not.toHaveProperty("err.stack");
    expect(record).not.toHaveProperty("err.cause");
  }
}

function piiError(): Error & { code: string } {
  const error = new Error(`${PII_NAME}, ${PII_PHONE}, ${PII_ADDRESS}`) as Error & { code: string };
  error.code = "ECONNRESET";
  return error;
}

function providerThatThrows(error: unknown): DeliveryProvider {
  return {
    name: "fake",
    getShipment: async () => {
      throw error;
    },
  } as unknown as DeliveryProvider;
}

function providerErrorCall(log: CapturedLogger): Record<string, unknown> | undefined {
  return log.warn.mock.calls.find(
    ([payload]) => payload.code === "delivery_reconcile_provider_error",
  )?.[0];
}

const delivered: ShipmentState = {
  providerOrderId: null,
  statusCode: "DELIVERED",
  statusName: "Вручён",
  trackNumber: null,
  statusDateTime: NOW.toISOString(),
};

describe("delivery reconcile log redaction", () => {
  beforeEach(() => {
    state.candidates = [];
    state.transactionError = null;
    state.updates = [];
  });

  it("logs only a safe name and code when the provider call fails with PII", async () => {
    state.candidates = [{ id: 41, orderId: 7, providerOrderId: "remote-pii" }];
    const log = captureLogger();

    await runDeliveryReconcile(providerThatThrows(piiError()), log, NOW);

    const payload = providerErrorCall(log);
    expect(payload).toMatchObject({
      code: "delivery_reconcile_provider_error",
      delivery_id: 41,
      order_id: 7,
      provider: "fake",
    });
    expect(payload?.err).toEqual({ name: "Error", code: "ECONNRESET" });
    expect(Object.keys(payload?.err as object).sort()).toEqual(["code", "name"]);
    expectNoPii(log);

    // The failure path still bumps the attempt timestamp and never applies a
    // shipment status.
    expect(state.updates).toEqual([{ updatedAt: NOW }]);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("logs only a safe name when a reconcile row fails with PII", async () => {
    state.candidates = [{ id: 42, orderId: 8, providerOrderId: "remote-row" }];
    state.transactionError = piiError();
    const log = captureLogger();
    const provider = {
      name: "fake",
      getShipment: async () => delivered,
    } as unknown as DeliveryProvider;

    await runDeliveryReconcile(provider, log, NOW);

    const call = log.warn.mock.calls.find(
      ([payload]) => payload.code === "delivery_reconcile_failed",
    );
    expect(call).toBeDefined();
    expect(call?.[0]).toMatchObject({
      code: "delivery_reconcile_failed",
      delivery_id: 42,
      order_id: 8,
      provider: "fake",
    });
    expect(call?.[0].err).toEqual({ name: "Error", code: "ECONNRESET" });
    expectNoPii(log);

    expect(log.info).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("does not log a thrown non-Error value", async () => {
    state.candidates = [{ id: 43, orderId: 9, providerOrderId: "remote-string" }];
    const log = captureLogger();

    await runDeliveryReconcile(providerThatThrows(`${PII_NAME} ${PII_PHONE}`), log, NOW);

    expect(providerErrorCall(log)?.err).toEqual({ name: "UnknownError" });
    expectNoPii(log);
  });

  it("falls back to UnknownError when error.name looks like PII", async () => {
    state.candidates = [{ id: 44, orderId: 10, providerOrderId: "remote-name" }];
    const log = captureLogger();
    const error = new Error("provider failed");
    error.name = PII_NAME;

    await runDeliveryReconcile(providerThatThrows(error), log, NOW);

    expect(providerErrorCall(log)?.err).toEqual({ name: "UnknownError" });
    expectNoPii(log);
  });

  it("drops an unsafe error.code instead of logging it", async () => {
    state.candidates = [{ id: 45, orderId: 11, providerOrderId: "remote-code" }];
    const log = captureLogger();
    const error = new Error("provider failed") as Error & { code: string };
    error.code = PII_PHONE;

    await runDeliveryReconcile(providerThatThrows(error), log, NOW);

    const err = providerErrorCall(log)?.err as Record<string, unknown>;
    expect(err).toEqual({ name: "Error" });
    expect(Object.keys(err)).toEqual(["name"]);
    expectNoPii(log);
  });

  it("audits both pino arguments, not only the payload object", () => {
    const log = captureLogger();
    log.info({ code: "audit" }, `${PII_NAME} ${PII_PHONE}`);

    expect(loggedPayloads(log)).toContain(`${PII_NAME} ${PII_PHONE}`);
    expect(pinoOutput(log)).toContain(PII_PHONE);
  });

  it("does not copy error.cause", async () => {
    state.candidates = [{ id: 46, orderId: 12, providerOrderId: "remote-cause" }];
    const log = captureLogger();
    const cause = new Error(`${PII_NAME}, ${PII_PHONE}, ${PII_ADDRESS}`);
    const error = new Error("provider failed");
    (error as Error & { cause?: unknown }).cause = cause;

    await runDeliveryReconcile(providerThatThrows(error), log, NOW);

    const err = providerErrorCall(log)?.err as Record<string, unknown>;
    expect(err).toEqual({ name: "Error" });
    expect(err).not.toHaveProperty("cause");
    expect(Object.keys(err)).toEqual(["name"]);
    expectNoPii(log);
  });
});

const DELIVERY_SOURCES = {
  "delivery.reconcile.ts": readFileSync(
    new URL("./delivery.reconcile.ts", import.meta.url),
    "utf8",
  ),
  "delivery.reconcile.scheduler.ts": readFileSync(
    new URL("./delivery.reconcile.scheduler.ts", import.meta.url),
    "utf8",
  ),
  "delivery.route.ts": readFileSync(new URL("./delivery.route.ts", import.meta.url), "utf8"),
  "shipment.route.ts": readFileSync(new URL("./shipment.route.ts", import.meta.url), "utf8"),
};

const ALLOWED_LOG_KEYS: Record<keyof typeof DELIVERY_SOURCES, ReadonlySet<string>> = {
  "delivery.reconcile.ts": new Set([
    "code",
    "delivery_id",
    "order_id",
    "provider",
    "err",
    "status",
  ]),
  "delivery.reconcile.scheduler.ts": new Set(["code"]),
  "delivery.route.ts": new Set(["code", "shops", "durationMs", "error"]),
  "shipment.route.ts": new Set(["code"]),
};

type SourceLogCall = { file: string; method: string; args: string };

/** Extracts every `log.<method>(...)` / `logger.<method>(...)` call. */
function logCalls(file: string, source: string): SourceLogCall[] {
  const calls: SourceLogCall[] = [];
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
    calls.push({ file, method, args: source.slice(start, index - 1) });
  }

  return calls;
}

/** Top-level keys of the first object literal in a log call, if any. */
function topLevelKeys(args: string): string[] {
  const object = /^\s*\{([\s\S]*?)\}\s*(?:,|$)/.exec(args);
  if (!object?.[1]) {
    return [];
  }
  return [...object[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("delivery log source audit", () => {
  it("never passes a raw Error or an err/error shorthand to a logger", () => {
    const rawAnyArg = /(?:^|,)\s*(?:error|err|cause)\s*(?:,|\)|$)/;
    const rawPair = /(?:^|[,{]\s*)(?:err|error)\s*:\s*(?:error|err|cause)\s*(?=[,}])/;
    const rawShorthand = /(?:^|[,{]\s*)(?:err|error|cause)\s*(?=[,}])/;

    for (const [file, source] of Object.entries(DELIVERY_SOURCES)) {
      for (const call of logCalls(file, source)) {
        const where = `${file} log.${call.method}`;
        expect(call.args, where).not.toMatch(rawAnyArg);
        expect(call.args, where).not.toMatch(rawPair);
        expect(call.args, where).not.toMatch(rawShorthand);
      }
    }
  });

  it("keeps every delivery log payload within its allowlisted keys", () => {
    for (const [file, source] of Object.entries(DELIVERY_SOURCES)) {
      const allowed = ALLOWED_LOG_KEYS[file as keyof typeof DELIVERY_SOURCES];
      for (const call of logCalls(file, source)) {
        for (const key of topLevelKeys(call.args)) {
          expect(allowed.has(key), `${file} log.${call.method} key ${key}`).toBe(true);
        }
      }
    }
  });

  it("writes reconcile errors only through safeErrorForLog", () => {
    const values = [
      ...DELIVERY_SOURCES["delivery.reconcile.ts"].matchAll(/\berr\s*:\s*([^,}\n]+)/g),
    ].map((match) => match[1]?.trim());
    expect(values).toEqual(["safeErrorForLog(error)", "safeErrorForLog(error)"]);
  });

  it("allows route error.code as a machine code, not a raw Error", () => {
    /**
     * Route logs have used `error.code ?? "internal_error"` since before this
     * fix. It is a machine code, not an Error object, so it stays
     * allowlisted; every other `error:` value fails the audit. The quote log
     * carries the same kind of string code via `result.error`.
     */
    const allowedErrorValues = new Set([
      'error.code ?? "internal_error"',
      "result.ok ? undefined : result.error",
    ]);

    for (const [file, source] of Object.entries(DELIVERY_SOURCES)) {
      for (const call of logCalls(file, source)) {
        for (const match of call.args.matchAll(/(?:^|[,{]\s*)error\s*:\s*([^,}\n]+)/g)) {
          const value = match[1]?.trim() ?? "";
          expect(allowedErrorValues.has(value), `${file} error value ${value}`).toBe(true);
        }
      }
    }
  });
});
