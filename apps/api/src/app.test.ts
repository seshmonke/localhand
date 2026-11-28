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
  function wired(enabled: boolean, provider = createFakeDeliveryProvider()) {
    const lines: string[] = [];
    const instance = buildApp({
      deliveryProvider: provider,
      ...(enabled ? { deliveryReconcile: true } : {}),
      logger: { level: "error" as const, stream: { write: (line: string) => lines.push(line) } },
    });
    return { instance, lines, provider };
  }

  it("runs a pass and one subscription check when enabled", async () => {
    const { instance, lines, provider } = wired(true);
    const ensure = vi.spyOn(provider, "ensureOrderStatusWebhook");

    await instance.ready();
    expect(ensure).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(lines.join("")).toContain("delivery reconcile pass failed"));
    await instance.close();
  });

  it("logs a safe code when the subscription conflicts", async () => {
    const { instance, lines, provider } = wired(true);
    vi.spyOn(provider, "ensureOrderStatusWebhook").mockRejectedValueOnce(
      new DeliveryWebhookConflictError(),
    );

    await instance.ready();
    expect(lines.join("")).toContain("delivery_webhook_subscription_failed");
    await instance.close();
  });

  it("stays off in tests by default", async () => {
    const { instance, provider } = wired(false);
    const ensure = vi.spyOn(provider, "ensureOrderStatusWebhook");

    await instance.ready();
    expect(ensure).not.toHaveBeenCalled();
    await instance.close();
  });
});
