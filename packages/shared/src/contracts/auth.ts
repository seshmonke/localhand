import { z } from "zod";

const RUSSIAN_MOBILE_NATIONAL = /^9\d{9}$/;
const RUSSIAN_PHONE_CHARS = /^[+\d\s()-]+$/;

/**
 * Normalizes a Russian mobile number to +7XXXXXXXXXX.
 * Returns null for non-Russian or non-mobile numbers.
 */
export function normalizeRussianPhone(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0 || !RUSSIAN_PHONE_CHARS.test(value)) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 && RUSSIAN_MOBILE_NATIONAL.test(digits)) {
    return `+7${digits}`;
  }

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const national = digits.slice(1);
    if (RUSSIAN_MOBILE_NATIONAL.test(national)) {
      return `+7${national}`;
    }
  }

  return null;
}

export const RussianPhoneSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeRussianPhone(value);
  if (normalized === null) {
    ctx.addIssue({ code: "custom", message: "invalid_phone" });
    return z.NEVER;
  }
  return normalized;
});

export const AuthUserSchema = z.object({
  id: z.number().int().positive(),
  phone: z.string().regex(/^\+7\d{10}$/),
});

export const RequestCodeSchema = z.object({
  phone: RussianPhoneSchema,
});

export const RequestCodeResponseSchema = z.object({
  ok: z.literal(true),
  devCode: z.string().optional(),
});

export const VerifyCodeSchema = z.object({
  phone: RussianPhoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const VerifyCodeResponseSchema = z.object({
  user: AuthUserSchema,
});

export const MeResponseSchema = z.object({
  user: AuthUserSchema,
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type RequestCodeRequest = z.infer<typeof RequestCodeSchema>;
export type RequestCodeResponse = z.infer<typeof RequestCodeResponseSchema>;
export type VerifyCodeRequest = z.infer<typeof VerifyCodeSchema>;
export type VerifyCodeResponse = z.infer<typeof VerifyCodeResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
