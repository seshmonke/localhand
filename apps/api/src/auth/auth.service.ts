import type { AuthUser } from "@localhand/shared";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import { otpCodes, users } from "../db/schema.js";
import { otpSecret } from "../env.js";
import { generateOtpCode, hashOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS, verifyOtpRecord } from "./otp.js";
import type { SmsProvider } from "./sms/sms-provider.js";

export type RequestCodeResult = {
  devCode?: string;
};

export async function requestCode(
  input: { phone: string },
  deps: { smsProvider: SmsProvider },
): Promise<RequestCodeResult> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await requireDb()
    .insert(otpCodes)
    .values({
      phone: input.phone,
      codeHash: hashOtp({ phone: input.phone, code, secret: otpSecret }),
      expiresAt,
    });

  return deps.smsProvider.sendCode({ phone: input.phone, code });
}

export async function verifyCode(input: { phone: string; code: string }): Promise<AuthUser | null> {
  const db = requireDb();
  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(eq(otpCodes.phone, input.phone))
    .orderBy(desc(otpCodes.createdAt), desc(otpCodes.id))
    .limit(1);

  if (!otp) {
    return null;
  }

  const now = new Date();
  const verification = verifyOtpRecord({
    phone: input.phone,
    code: input.code,
    secret: otpSecret,
    record: {
      codeHash: otp.codeHash,
      expiresAt: otp.expiresAt,
      attempts: otp.attempts,
      consumedAt: otp.consumedAt,
    },
    now,
  });

  if (verification === "invalid") {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(
        and(
          eq(otpCodes.id, otp.id),
          isNull(otpCodes.consumedAt),
          lt(otpCodes.attempts, OTP_MAX_ATTEMPTS),
        ),
      );
    return null;
  }

  if (verification !== "valid") {
    return null;
  }

  const [consumed] = await db
    .update(otpCodes)
    .set({ consumedAt: now })
    .where(and(eq(otpCodes.id, otp.id), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, now)))
    .returning({ id: otpCodes.id });

  if (!consumed) {
    return null;
  }

  const [user] = await db
    .insert(users)
    .values({ phone: input.phone })
    .onConflictDoUpdate({ target: users.phone, set: { phone: input.phone } })
    .returning({ id: users.id, phone: users.phone });

  return user ?? null;
}

export async function getUserById(id: number): Promise<AuthUser | null> {
  const [user] = await requireDb()
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
}
