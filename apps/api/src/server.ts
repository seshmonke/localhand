import { env } from "./env.js";
import { buildApp } from "./app.js";

const app = buildApp();

/**
 * SIGTERM/SIGINT close Fastify instead of killing the process mid-transaction.
 * The payments reconcile scheduler registers an `onClose` hook, so an in-flight
 * pass finishes before the process exits.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (error: unknown) {
    app.log.error(error);
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`Local Hand API listening on ${address}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
