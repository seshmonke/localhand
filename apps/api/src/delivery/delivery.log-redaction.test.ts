import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryProvider, ShipmentState } from "./provider.js";

/**
 * PII guard for the delivery reconcile logs.
 *
 * The provider may echo a recipient name, phone or address in an error
 * message or response body. A raw `err: error` makes pino serialize
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

function loggedPayloads(log: CapturedLogger): Array<Record<string, unknown>> {
  return [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls].map(
    ([payload]) => payload as Record<string, unknown>,
  );
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

function expectNoPii(log: CapturedLogger): void {
  const output = pinoOutput(log);
  expect(output).not.toContain(PII_NAME);
  expect(output).not.toContain(PII_PHONE);
  expect(output).not.toContain(PII_ADDRESS);
  for (const payload of loggedPayloads(log)) {
    expect(payload).not.toHaveProperty("err.message");
    expect(payload).not.toHaveProperty("err.stack");
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

    const call = log.warn.mock.calls.find(
      ([payload]) => payload.code === "delivery_reconcile_provider_error",
    );
    expect(call).toBeDefined();
    expect(call?.[0]).toMatchObject({
      code: "delivery_reconcile_provider_error",
      delivery_id: 41,
      order_id: 7,
      provider: "fake",
    });
    expect(call?.[0].err).toEqual({ name: "Error", code: "ECONNRESET" });
    expect(Object.keys(call?.[0].err as object).sort()).toEqual(["code", "name"]);
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

    const call = log.warn.mock.calls.find(
      ([payload]) => payload.code === "delivery_reconcile_provider_error",
    );
    expect(call?.[0].err).toEqual({ name: "UnknownError" });
    expectNoPii(log);
  });
});
