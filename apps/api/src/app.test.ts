import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { DeliveryWebhookConflictError } from "./delivery/cdek-provider.js";
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
  function logLines() {
    const lines: string[] = [];
    return {
      lines,
      logger: {
        level: "error" as const,
        stream: {
          write(line: string) {
            lines.push(line);
          },
        },
      },
    };
  }

  it("runs a reconcile pass and one subscription check when enabled", async () => {
    const provider = createFakeDeliveryProvider();
    const ensure = vi.spyOn(provider, "ensureOrderStatusWebhook");
    const { lines, logger } = logLines();
    const wired = buildApp({ deliveryProvider: provider, deliveryReconcile: true, logger });

    await wired.ready();
    expect(ensure).toHaveBeenCalledTimes(1);
    // runNow executes without DATABASE_URL and reports the safe code instead
    // of crashing the process.
    await vi.waitFor(() => expect(lines.join("")).toContain("delivery reconcile pass failed"));

    await wired.close();
  });

  it("logs a safe code when the webhook subscription conflicts", async () => {
    const provider = createFakeDeliveryProvider();
    vi.spyOn(provider, "ensureOrderStatusWebhook").mockRejectedValueOnce(
      new DeliveryWebhookConflictError(),
    );
    const { lines, logger } = logLines();
    const wired = buildApp({ deliveryProvider: provider, deliveryReconcile: true, logger });

    await expect(wired.ready()).resolves.toBeDefined();
    expect(lines.join("")).toContain("delivery_webhook_subscription_failed");

    await wired.close();
  });

  it("does not start reconcile or check subscriptions in tests by default", async () => {
    const provider = createFakeDeliveryProvider();
    const ensure = vi.spyOn(provider, "ensureOrderStatusWebhook");
    const wired = buildApp({ deliveryProvider: provider });

    await wired.ready();
    expect(ensure).not.toHaveBeenCalled();

    await wired.close();
  });
});
