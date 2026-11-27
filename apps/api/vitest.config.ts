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
    },
    // DB-backed test files share a single PostgreSQL test database and
    // truncate it; running them in parallel makes them delete each other's data.
    fileParallelism: false,
  },
});
