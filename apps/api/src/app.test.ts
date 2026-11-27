import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

describe("health", () => {
  it("returns the service status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "localhand-api",
      version: "0.0.0",
      smsProvider: env.SMS_PROVIDER,
    });
  });

  it("forces the dev SMS provider for tests even if the shell sets another one", () => {
    expect(process.env.SMS_PROVIDER).toBe("dev");
    expect(env.SMS_PROVIDER).toBe("dev");
  });
});
