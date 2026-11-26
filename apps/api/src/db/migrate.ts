import { migrate } from "drizzle-orm/node-postgres/migrator";
import { requireDb, requirePool } from "./client.js";

await migrate(requireDb(), { migrationsFolder: "drizzle" });
await requirePool().end();
