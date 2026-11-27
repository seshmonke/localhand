import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests must never reach a real SMS provider, even when the shell exports
    // SMS_PROVIDER=smsru for a manual dev run. Vitest applies this before the
    // test modules (and env.ts) are imported.
    env: {
      NODE_ENV: "test",
      SMS_PROVIDER: "dev",
      // The API tests exercise the fake payment contour end to end. A route or
      // test must never construct its own provider: buildApp shares this one.
      PAYMENTS_PROVIDER: "fake",
      PAYMENTS_ENV: "test",
      PAYMENTS_FAKE_ENABLED: "true",
      PAYMENTS_STATE_SECRET: "s3-payments-state-secret-9Qm2Vx7Lp4Rt8Wc1",
      PAYMENTS_TOKEN_KEYS: JSON.stringify({
        1: Buffer.alloc(32, 7).toString("base64"),
      }),
      PAYMENTS_TOKEN_KEY_VERSION: "1",
      PAYMENTS_WEBHOOK_URL: "http://localhost:3000/payments/yookassa/webhook",
    },
    // DB-backed test files share a single PostgreSQL test database and
    // truncate it; running them in parallel makes them delete each other's data.
    fileParallelism: false,
  },
});
