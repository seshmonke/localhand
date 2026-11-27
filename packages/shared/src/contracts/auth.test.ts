import { describe, expect, it } from "vitest";
import { normalizeRussianPhone, RequestCodeSchema, VerifyCodeSchema } from "./auth.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const NORMALIZED = phone("+7", "999", "123", "45", "67");

describe("normalizeRussianPhone", () => {
  it("normalizes common Russian mobile formats", () => {
    expect(normalizeRussianPhone(phone("8", " (", "999", ") ", "123", "-", "45", "-", "67"))).toBe(
      NORMALIZED,
    );
    expect(normalizeRussianPhone(phone("+7", " ", "999", " ", "123", "-", "45", "-", "67"))).toBe(
      NORMALIZED,
    );
    expect(normalizeRussianPhone(phone("7", "999", "123", "45", "67"))).toBe(NORMALIZED);
    expect(normalizeRussianPhone(phone("999", "123", "45", "67"))).toBe(NORMALIZED);
    expect(
      normalizeRussianPhone(phone("  ", "8", "-", "999", "-", "123", "-", "45", "-", "67", "  ")),
    ).toBe(NORMALIZED);
  });

  it("rejects non-mobile and non-Russian numbers", () => {
    expect(normalizeRussianPhone(phone("+7", "495", "123", "45", "67"))).toBeNull();
    expect(normalizeRussianPhone(phone("+1", "555", "123", "45", "67"))).toBeNull();
    expect(normalizeRussianPhone(phone("999", "123", "45", "6"))).toBeNull();
    expect(normalizeRussianPhone("not-a-phone")).toBeNull();
    expect(normalizeRussianPhone("")).toBeNull();
  });
});

describe("auth schemas", () => {
  it("normalizes the phone in request body", () => {
    expect(RequestCodeSchema.parse({ phone: phone("8", "999", "123", "45", "67") })).toEqual({
      phone: NORMALIZED,
    });
  });

  it("rejects an invalid phone", () => {
    const result = RequestCodeSchema.safeParse({
      phone: phone("+7", "495", "123", "45", "67"),
    });
    expect(result.success).toBe(false);
  });

  it("requires a six-digit code", () => {
    expect(VerifyCodeSchema.safeParse({ phone: NORMALIZED, code: "123456" }).success).toBe(true);
    expect(VerifyCodeSchema.safeParse({ phone: NORMALIZED, code: "12345" }).success).toBe(false);
    expect(VerifyCodeSchema.safeParse({ phone: NORMALIZED, code: "12345a" }).success).toBe(false);
  });
});
