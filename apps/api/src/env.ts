import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: path.join(repoRoot, ".env"), quiet: true });

const DEV_JWT_SECRET = "localhand-dev-jwt-secret-not-for-production-use";
const DEV_OTP_SECRET = "localhand-dev-otp-secret-not-for-production-use";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().min(32).optional(),
    OTP_SECRET: z.string().min(32).optional(),
    SMS_PROVIDER: z.enum(["dev", "smsru"]).default("dev"),
    SMSRU_API_ID: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") {
      return;
    }

    if (!value.JWT_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "JWT_SECRET is required in production",
      });
    }
    if (!value.OTP_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["OTP_SECRET"],
        message: "OTP_SECRET is required in production",
      });
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
export const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;
export const otpSecret = env.OTP_SECRET ?? DEV_OTP_SECRET;
