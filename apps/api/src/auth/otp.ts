import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpRecordState = {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
};

export type OtpVerification = "valid" | "invalid" | "expired" | "too_many_attempts" | "consumed";

export function generateOtpCode(): string {
  const upperBound = 10 ** OTP_CODE_LENGTH;
  return randomInt(0, upperBound).toString().padStart(OTP_CODE_LENGTH, "0");
}

export function hashOtp(input: { phone: string; code: string; secret: string }): string {
  return createHmac("sha256", input.secret).update(`${input.phone}:${input.code}`).digest("hex");
}

export function isValidOtpCode(input: {
  phone: string;
  code: string;
  codeHash: string;
  secret: string;
}): boolean {
  const expected = hashOtp({
    phone: input.phone,
    code: input.code,
    secret: input.secret,
  });
  if (input.codeHash.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(input.codeHash, "utf8"), Buffer.from(expected, "utf8"));
}

export function verifyOtpRecord(input: {
  phone: string;
  code: string;
  secret: string;
  record: OtpRecordState;
  now?: Date;
}): OtpVerification {
  const now = input.now ?? new Date();

  if (input.record.consumedAt !== null) {
    return "consumed";
  }
  if (input.record.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  if (input.record.attempts >= OTP_MAX_ATTEMPTS) {
    return "too_many_attempts";
  }
  if (
    !isValidOtpCode({
      phone: input.phone,
      code: input.code,
      codeHash: input.record.codeHash,
      secret: input.secret,
    })
  ) {
    return "invalid";
  }
  return "valid";
}
