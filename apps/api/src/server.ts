import { env } from "./env.js";
import { buildApp } from "./app.js";

const app = buildApp();

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`Local Hand API listening on ${address}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
