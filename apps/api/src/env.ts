import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: path.join(repoRoot, ".env"), quiet: true });

const DEV_JWT_SECRET = "localhand-dev-jwt-secret-not-for-production-use";
const DEV_OTP_SECRET = "localhand-dev-otp-secret-not-for-production-use";

const FORBIDDEN_SECRET_PARTS = ["change-me", "dev-only", "localhand-dev-"];

export function isForbiddenSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return FORBIDDEN_SECRET_PARTS.some((part) => normalized.includes(part));
}

const SecretSchema = z
  .string()
  .min(32)
  .refine((value) => !isForbiddenSecret(value), {
    message: "secret must not contain a known placeholder",
  });

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: SecretSchema.optional(),
    OTP_SECRET: SecretSchema.optional(),
    SMS_PROVIDER: z.enum(["dev", "smsru"]).default("dev"),
    SMSRU_API_ID: z.string().min(1).optional(),
    TRUST_PROXY: z.enum(["true", "false"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "test") {
      if (!value.JWT_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_SECRET"],
          message: "JWT_SECRET is required outside NODE_ENV=test",
        });
      }
      if (!value.OTP_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["OTP_SECRET"],
          message: "OTP_SECRET is required outside NODE_ENV=test",
        });
      }
    }

    if (value.NODE_ENV !== "production") {
      return;
    }

    if (value.SMS_PROVIDER === "dev") {
      ctx.addIssue({
        code: "custom",
        path: ["SMS_PROVIDER"],
        message: "SMS_PROVIDER=dev is not allowed in production",
      });
    }
    if (value.SMS_PROVIDER === "smsru" && !value.SMSRU_API_ID) {
      ctx.addIssue({
        code: "custom",
        path: ["SMSRU_API_ID"],
        message: "SMSRU_API_ID is required when SMS_PROVIDER=smsru",
      });
    }
  });

export const env = EnvSchema.parse(process.env);
export type AppNodeEnv = z.infer<typeof EnvSchema>["NODE_ENV"];

export function resolveTrustProxy(nodeEnv: AppNodeEnv, raw: string | undefined): boolean {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return nodeEnv === "production";
}

export const trustProxy = resolveTrustProxy(env.NODE_ENV, env.TRUST_PROXY);
export const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;
export const otpSecret = env.OTP_SECRET ?? DEV_OTP_SECRET;
