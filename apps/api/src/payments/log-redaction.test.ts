import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import {
  PAYMENTS_CALLBACK_PATH,
  paymentRequestSerializer,
  resolveFastifyLogger,
} from "./log-redaction.js";

describe("payment request log serializer", () => {
  it("strips the OAuth code and state query from the callback URL", () => {
    const serialized = paymentRequestSerializer({
      method: "GET",
      url: `${PAYMENTS_CALLBACK_PATH}?code=secret-code&state=secret-state`,
      host: "api.example.com",
      ip: "127.0.0.1",
    });

    expect(serialized.url).toBe(PAYMENTS_CALLBACK_PATH);
    expect(JSON.stringify(serialized)).not.toContain("secret-code");
    expect(JSON.stringify(serialized)).not.toContain("secret-state");
  });

  it("keeps the query for other routes", () => {
    const serialized = paymentRequestSerializer({
      method: "GET",
      url: "/orders?page=2",
    });

    expect(serialized.url).toBe("/orders?page=2");
  });

  it("installs the safe serializer outside tests and stays silent in tests", () => {
    expect(resolveFastifyLogger("test", undefined)).toBe(false);

    const productionLogger = resolveFastifyLogger("production", undefined);
    expect(typeof productionLogger).toBe("object");
    expect(productionLogger).not.toBeNull();
    if (typeof productionLogger !== "object" || productionLogger === null) {
      throw new Error("expected logger options");
    }
    expect(productionLogger.serializers?.req).toBe(paymentRequestSerializer);

    const custom = { level: "silent" as const };
    expect(resolveFastifyLogger("production", custom)).toBe(custom);
  });
});

describe("callback access log", () => {
  const lines: string[] = [];
  const stream = {
    write(line: string) {
      lines.push(line);
    },
  };
  const productionLogger = resolveFastifyLogger("production", undefined);
  if (typeof productionLogger !== "object" || productionLogger === null) {
    throw new Error("expected logger options");
  }
  const app = buildApp({ logger: { ...productionLogger, level: "info", stream } });

  afterAll(async () => {
    await app.close();
  });

  it("does not write the OAuth code or state into the log stream", async () => {
    const response = await app.inject({
      method: "GET",
      url: `${PAYMENTS_CALLBACK_PATH}?code=super-secret-code&state=super-secret-state`,
    });
    expect(response.statusCode).toBe(401);

    const output = lines.join("");
    expect(output).toContain(PAYMENTS_CALLBACK_PATH);
    expect(output).not.toContain("super-secret-code");
    expect(output).not.toContain("super-secret-state");
  });
});
