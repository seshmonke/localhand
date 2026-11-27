import type { FastifyInstance } from "fastify";
import type { PaymentsRuntime } from "./context.js";
import { PAYMENTS_RECONCILE_INTERVAL_MS, runPaymentReconcile } from "./payments.reconcile.js";

export type ReconcileScheduler = {
  /** Runs one pass immediately, skipping if a pass is already in flight. */
  runNow: () => void;
  /** Stops the interval and waits for the in-flight pass. */
  stop: () => Promise<void>;
};

/**
 * One timer per API process. `unref` keeps a short-lived script/test process
 * from being held open by the interval; Fastify still stops it explicitly on
 * close, so graceful shutdown does not cut a reconcile pass mid-transaction.
 */
export function startPaymentsReconcile(
  app: FastifyInstance,
  runtime: PaymentsRuntime,
): ReconcileScheduler {
  let active: Promise<void> | null = null;
  let stopped = false;

  const run = (): Promise<void> => {
    if (stopped || active) {
      return active ?? Promise.resolve();
    }

    active = runPaymentReconcile(runtime, app.log)
      .catch((error: unknown) => {
        app.log.error(
          { code: error instanceof Error ? error.name : "payments_reconcile_failed" },
          "payments reconcile pass failed",
        );
      })
      .finally(() => {
        active = null;
      });
    return active;
  };

  const timer = setInterval(() => {
    void run();
  }, PAYMENTS_RECONCILE_INTERVAL_MS);
  timer.unref?.();

  const stop = async (): Promise<void> => {
    stopped = true;
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
