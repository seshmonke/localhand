import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_SOURCES = [
  "./payments.route.ts",
  "./accounts.service.ts",
  "./payments.service.ts",
  "./payments.webhook.service.ts",
  "./payments.reconcile.ts",
  "./payments.transitions.ts",
  "./payments.reconcile.scheduler.ts",
] as const;

const ALLOWED_LOG_KEYS = new Set(["code", "payment_id", "order_id", "status", "attempts"]);

type LogCall = { method: string; args: string };

function logCalls(source: string): LogCall[] {
  const calls: LogCall[] = [];
  const marker = /\b(?:logger|log)\.([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of source.matchAll(marker)) {
    const method = match[1];
    if (!method) {
      continue;
    }
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let index = start;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
      }
      index += 1;
    }
    calls.push({ method, args: source.slice(start, index - 1) });
  }
  return calls;
}

function payloadKeys(args: string): string[] {
  const object = /^\s*\{([\s\S]*?)\}\s*(?:,|$)/.exec(args);
  if (!object?.[1]) {
    return [];
  }
  return [...object[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("payments provider wiring", () => {
  it("never constructs a payment provider inside routes or services", () => {
    for (const file of ROUTE_SOURCES) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/new\s+FakePaymentProvider\s*\(/);
      expect(source, file).not.toMatch(/new\s+YooKassa\w*\s*\(/);
    }
  });

  it("builds the single runtime in app wiring and reads it from the decorated instance", () => {
    const appSource = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
    expect(appSource).toContain("createPaymentsRuntime(");
    expect(appSource).toContain('app.decorate("payments"');
    expect(appSource).toContain("app.register(paymentsRoutes)");

    for (const file of ROUTE_SOURCES) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/createPaymentProvider\s*\(/);
    }
  });
});

describe("payments logging surface", () => {
  it("writes only payment identifiers, status/code and attempt counters", () => {
    for (const file of ROUTE_SOURCES) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const call of logCalls(source)) {
        expect(call.args, `${file}: ${call.method}`).not.toMatch(/request\.body|\.body\b/);
        for (const key of payloadKeys(call.args)) {
          expect(ALLOWED_LOG_KEYS.has(key), `${file}: ${key}`).toBe(true);
        }
      }
    }
  });

  it("uses a safe code for an unknown webhook and does not log the webhook body", () => {
    const webhookSource = readFileSync(
      new URL("./payments.webhook.service.ts", import.meta.url),
      "utf8",
    );
    expect(webhookSource).toContain("webhook_unknown_payment");
    expect(webhookSource).not.toContain("request.body");
  });
});
