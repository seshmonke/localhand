import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const lockUrl = new URL("../docs/stack/integrations/versions.json", import.meta.url);
const lock = JSON.parse(await readFile(lockUrl, "utf8"));

let failed = false;

for (const [key, integration] of Object.entries(lock.integrations)) {
  process.stdout.write(`${key}: ${integration.spec_url}\n`);

  try {
    const response = await fetch(integration.spec_url, {
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "localhand-integrations-check/1" },
    });

    if (!response.ok) {
      console.error(`${key}: HTTP ${response.status}`);
      failed = true;
      continue;
    }

    const body = Buffer.from(await response.arrayBuffer());
    const hash = createHash("sha256").update(body).digest("hex");
    const expected = integration.spec_sha256;

    if (hash !== expected) {
      console.error(`${key}: spec changed`);
      console.error(`  expected ${expected}`);
      console.error(`  actual   ${hash}`);
      console.error("  update versions.json and the integration docs, then re-check the adapter");
      failed = true;
    } else {
      console.log(`${key}: ok (${integration.api}, ${integration.openapi})`);
    }
  } catch (error) {
    console.error(
      `${key}: check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
