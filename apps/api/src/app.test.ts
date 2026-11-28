import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { DeliveryWebhookConflictError } from "./delivery/cdek-provider.js";
import type { runDeliveryReconcile } from "./delivery/delivery.reconcile.js";
import { createFakeDeliveryProvider } from "./delivery/fake-provider.js";
import { env } from "./env.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

describe("health", () => {
  it("returns the service status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "localhand-api",
      version: "0.0.0",
      smsProvider: env.SMS_PROVIDER,
    });
  });

  it("forces the dev SMS provider for tests even if the shell sets another one", () => {
    expect(process.env.SMS_PROVIDER).toBe("dev");
    expect(env.SMS_PROVIDER).toBe("dev");
  });
});

describe("delivery reconcile wiring", () => {
  function wired(
    enabled: boolean,
    runner: typeof runDeliveryReconcile,
    provider = createFakeDeliveryProvider(),
  ) {
    const lines: string[] = [];
    const instance = buildApp({
      deliveryProvider: provider,
      ...(enabled ? { deliveryReconcile: true, deliveryReconcileRunner: runner } : {}),
      logger: { level: "error" as const, stream: { write: (line: string) => lines.push(line) } },
    });
    return { instance, lines, provider };
  }

  it("runs the injected pass and one subscription check when enabled", async () => {
    const runner = vi.fn<typeof runDeliveryReconcile>(async () => {});
    const { instance, provider } = wired(true, runner);
    const ensure = vi.spyOn(provider, "ensureOrderStatusWebhook");

    try {
      await instance.ready();
      expect(runner).toHaveBeenCalledTimes(1);
      expect(runner.mock.calls[0]?.[0]).toBe(provider);
      expect(ensure).toHaveBeenCalledTimes(1);
    } finally {
      await instance.close();
    }
  });

  it("logs a safe code when the injected pass fails", async () => {
    const runner = vi.fn<typeof runDeliveryReconcile>(async () => {
      throw new Error("boom");
    });
    const { instance, lines } = wired(true, runner);

    try {
      await instance.ready();
      expect(runner).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(lines.join("")).toContain("delivery reconcile pass failed"));
    } finally {
      await instance.close();
    }
  });

  it("logs conflict reason when the subscription conflicts", async () => {
    const runner = vi.fn<typeof runDeliveryReconcile>(async () => {});
    const { instance, lines, provider } = wired(true, runner);
    vi.spyOn(provider, "ensureOrderStatusWebhook").mockRejectedValueOnce(
      new DeliveryWebhookConflictError(),
    );

    try {
      await instance.ready();
      expect(lines.join("")).toContain('"reason":"conflict"');
    } finally {
      await instance.close();
    }
  });

  it("logs provider_error reason for a non-conflict subscription failure", async () => {
    const runner = vi.fn<typeof runDeliveryReconcile>(async () => {});
    const { instance, lines, provider } = wired(true, runner);
    vi.spyOn(provider, "ensureOrderStatusWebhook").mockRejectedValueOnce(new Error("network"));

    try {
      await instance.ready();
      expect(lines.join("")).toContain('"reason":"provider_error"');
    } finally {
      await instance.close();
    }
  });

  it("stays off in tests by default", async () => {
    const runner = vi.fn<typeof runDeliveryReconcile>(async () => {});
    const { instance, provider } = wired(false, runner);
    const ensure = vi.spyOn(provider, "ensureOrderStatusWebhook");

    try {
      await instance.ready();
      expect(runner).not.toHaveBeenCalled();
      expect(ensure).not.toHaveBeenCalled();
    } finally {
      await instance.close();
    }
  });
});
