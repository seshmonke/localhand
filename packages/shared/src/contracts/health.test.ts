import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./health.js";

function healthPayload(smsProvider: string) {
  return {
    status: "ok",
    service: "localhand-api",
    version: "0.0.0",
    smsProvider,
  };
}

describe("HealthResponseSchema", () => {
  it("parses the operational health payload with the SMS provider", () => {
    expect(HealthResponseSchema.parse(healthPayload("dev"))).toEqual(healthPayload("dev"));
    expect(HealthResponseSchema.parse(healthPayload("smsru"))).toEqual(healthPayload("smsru"));
  });

  it("rejects an unknown SMS provider", () => {
    expect(HealthResponseSchema.safeParse(healthPayload("twilio")).success).toBe(false);
    expect(HealthResponseSchema.safeParse(healthPayload("")).success).toBe(false);
  });

  it("requires the SMS provider field", () => {
    const withoutProvider = {
      status: "ok",
      service: "localhand-api",
      version: "0.0.0",
    };
    expect(HealthResponseSchema.safeParse(withoutProvider).success).toBe(false);
  });
});
