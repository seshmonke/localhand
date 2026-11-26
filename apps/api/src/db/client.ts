import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

const connectionString = env.DATABASE_URL;

export const pool = connectionString ? new Pool({ connectionString }) : null;
export const db = pool ? drizzle(pool, { schema }) : null;

export function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL");
  }
  return db;
}

export function requirePool() {
  if (!pool) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL");
  }
  return pool;
}
