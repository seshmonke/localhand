import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { startDeliveryReconcile } from "./delivery.reconcile.scheduler.js";
import { createFakeDeliveryProvider } from "./fake-provider.js";

function testApp() {
  const hooks: Array<() => Promise<void>> = [];
  const error = vi.fn();
  const instance = {
    log: { error },
    addHook: (name: string, hook: () => Promise<void>) => {
      if (name === "onClose") {
        hooks.push(hook);
      }
    },
  } as unknown as FastifyInstance;
  return { instance, error, hooks };
}

describe("delivery reconcile scheduler", () => {
  it("does not start a second pass and stop waits for the in-flight one", async () => {
    const { instance } = testApp();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pass = vi.fn(async () => {
      await gate;
    });
    const scheduler = startDeliveryReconcile(instance, createFakeDeliveryProvider(), pass);

    scheduler.runNow();
    scheduler.runNow();
    expect(pass).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("logs a failed pass with a safe code instead of throwing", async () => {
    const { instance, error } = testApp();
    const scheduler = startDeliveryReconcile(instance, createFakeDeliveryProvider(), async () => {
      throw new Error("boom");
    });

    scheduler.runNow();
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error.mock.calls[0]?.[0]).toEqual({ code: "delivery_reconcile_failed" });
    await scheduler.stop();
  });

  it("stops on the onClose hook", async () => {
    const { instance, hooks } = testApp();
    const pass = vi.fn(async () => {});
    const scheduler = startDeliveryReconcile(instance, createFakeDeliveryProvider(), pass);

    scheduler.runNow();
    expect(pass).toHaveBeenCalledTimes(1);
    expect(hooks).toHaveLength(1);
    await hooks[0]?.();
    scheduler.runNow();
    expect(pass).toHaveBeenCalledTimes(1);
  });
});
