import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(apiRoot, "../../.env"), quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhand:localhand@localhost:5433/localhand",
  },
  verbose: true,
  strict: true,
});
