import { db, pool } from "./client.js";
import { appMeta } from "./schema.js";

await db
  .insert(appMeta)
  .values({ key: "schema_version", value: "1" })
  .onConflictDoUpdate({
    target: appMeta.key,
    set: { value: "1", updatedAt: new Date() },
  });

await pool.end();
