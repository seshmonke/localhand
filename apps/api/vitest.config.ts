import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB-backed test files share a single PostgreSQL test database and
    // truncate it; running them in parallel makes them delete each other's data.
    fileParallelism: false,
  },
});
