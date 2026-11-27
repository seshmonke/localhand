import { describe, expect, it } from "vitest";
import {
  generateOtpCode,
  hashOtp,
  isValidOtpCode,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  verifyOtpRecord,
} from "./otp.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const TEST_PHONE = phone("+7", "999", "000", "00", "01");
const OTHER_PHONE = phone("+7", "999", "000", "00", "02");
const TEST_SECRET = "test-otp-secret-for-unit-tests";
const TEST_CODE = "123456";
const WRONG_CODE = "654321";
const NOW = new Date("2026-11-27T12:00:00.000Z");

describe("generateOtpCode", () => {
  it("returns six digits", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashOtp", () => {
  it("is deterministic and depends on phone, code and secret", () => {
    const hash = hashOtp({ phone: TEST_PHONE, code: TEST_CODE, secret: TEST_SECRET });

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(TEST_CODE);
    expect(hashOtp({ phone: TEST_PHONE, code: TEST_CODE, secret: TEST_SECRET })).toBe(hash);
    expect(hashOtp({ phone: OTHER_PHONE, code: TEST_CODE, secret: TEST_SECRET })).not.toBe(hash);
    expect(hashOtp({ phone: TEST_PHONE, code: WRONG_CODE, secret: TEST_SECRET })).not.toBe(hash);
    expect(hashOtp({ phone: TEST_PHONE, code: TEST_CODE, secret: "another-secret" })).not.toBe(
      hash,
    );
  });
});

describe("isValidOtpCode", () => {
  it("accepts only the matching code", () => {
    const codeHash = hashOtp({ phone: TEST_PHONE, code: TEST_CODE, secret: TEST_SECRET });

    expect(
      isValidOtpCode({
        phone: TEST_PHONE,
        code: TEST_CODE,
        codeHash,
        secret: TEST_SECRET,
      }),
    ).toBe(true);
    expect(
      isValidOtpCode({
        phone: TEST_PHONE,
        code: WRONG_CODE,
        codeHash,
        secret: TEST_SECRET,
      }),
    ).toBe(false);
  });
});

describe("verifyOtpRecord", () => {
  const validRecord = {
    codeHash: hashOtp({ phone: TEST_PHONE, code: TEST_CODE, secret: TEST_SECRET }),
    expiresAt: new Date(NOW.getTime() + OTP_TTL_MS),
    attempts: 0,
    consumedAt: null,
  };

  it("accepts a valid unexpired code", () => {
    expect(
      verifyOtpRecord({
        phone: TEST_PHONE,
        code: TEST_CODE,
        secret: TEST_SECRET,
        record: validRecord,
        now: NOW,
      }),
    ).toBe("valid");
  });

  it("rejects a wrong code", () => {
    expect(
      verifyOtpRecord({
        phone: TEST_PHONE,
        code: WRONG_CODE,
        secret: TEST_SECRET,
        record: validRecord,
        now: NOW,
      }),
    ).toBe("invalid");
  });

  it("rejects an expired code", () => {
    expect(
      verifyOtpRecord({
        phone: TEST_PHONE,
        code: TEST_CODE,
        secret: TEST_SECRET,
        record: { ...validRecord, expiresAt: NOW },
        now: NOW,
      }),
    ).toBe("expired");
  });

  it("rejects a code after too many attempts", () => {
    expect(
      verifyOtpRecord({
        phone: TEST_PHONE,
        code: TEST_CODE,
        secret: TEST_SECRET,
        record: { ...validRecord, attempts: OTP_MAX_ATTEMPTS },
        now: NOW,
      }),
    ).toBe("too_many_attempts");
  });

  it("rejects an already consumed code", () => {
    expect(
      verifyOtpRecord({
        phone: TEST_PHONE,
        code: TEST_CODE,
        secret: TEST_SECRET,
        record: { ...validRecord, consumedAt: NOW },
        now: NOW,
      }),
    ).toBe("consumed");
  });
});
