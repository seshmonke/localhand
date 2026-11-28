import type { FastifyInstance } from "fastify";
import { DELIVERY_RECONCILE_INTERVAL_MS, runDeliveryReconcile } from "./delivery.reconcile.js";
import type { DeliveryProvider } from "./provider.js";

export type DeliveryReconcileScheduler = {
  /** Runs one pass immediately, skipping if a pass is already in flight. */
  runNow: () => void;
  /** Stops the interval and waits for the in-flight pass. */
  stop: () => Promise<void>;
};

export type DeliveryReconcileRunner = typeof runDeliveryReconcile;

/**
 * One timer per API process, mirroring the payments scheduler. `unref` keeps
 * a short-lived process from being held open by the interval; Fastify stops
 * it explicitly on close and waits for the current pass to finish.
 */
export function startDeliveryReconcile(
  app: FastifyInstance,
  provider: DeliveryProvider,
  runPass: DeliveryReconcileRunner = runDeliveryReconcile,
): DeliveryReconcileScheduler {
  let active: Promise<void> | null = null;
  let stopped = false;
  const controller = new AbortController();

  const run = (): Promise<void> => {
    if (stopped || active) {
      return active ?? Promise.resolve();
    }

    active = (async () => runPass(provider, app.log, new Date(), controller.signal))()
      .catch(() => {
        app.log.error({ code: "delivery_reconcile_failed" }, "delivery reconcile pass failed");
      })
      .finally(() => {
        active = null;
      });
    return active;
  };

  const timer = setInterval(() => {
    void run();
  }, DELIVERY_RECONCILE_INTERVAL_MS);
  timer.unref?.();

  const stop = async (): Promise<void> => {
    stopped = true;
    controller.abort();
    clearInterval(timer);
    if (active) {
      await active;
    }
  };

  app.addHook("onClose", async () => {
    await stop();
  });

  return { runNow: () => void run(), stop };
}
