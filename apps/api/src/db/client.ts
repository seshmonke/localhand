import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL");
}

export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
