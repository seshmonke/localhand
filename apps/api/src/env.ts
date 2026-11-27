import path from "node:path";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: path.join(repoRoot, ".env"), quiet: true });

const DEV_JWT_SECRET = "localhand-dev-jwt-secret-not-for-production-use";
const DEV_OTP_SECRET = "localhand-dev-otp-secret-not-for-production-use";

const FORBIDDEN_SECRET_PARTS = ["change-me", "dev-only", "ci-only", "localhand-dev-"];

export function isForbiddenSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return FORBIDDEN_SECRET_PARTS.some((part) => normalized.includes(part));
}

function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

const OptionalSecretSchema = z.preprocess(emptyToUndefined, z.string().min(32).optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: OptionalSecretSchema,
    OTP_SECRET: OptionalSecretSchema,
    SMS_PROVIDER: z.enum(["dev", "smsru"]).default("dev"),
    SMSRU_API_ID: z.string().min(1).optional(),
    TRUST_PROXY: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "test") {
      for (const [path, secret] of [
        ["JWT_SECRET", value.JWT_SECRET],
        ["OTP_SECRET", value.OTP_SECRET],
      ] as const) {
        if (!secret) {
          ctx.addIssue({
            code: "custom",
            path: [path],
            message: `${path} is required outside NODE_ENV=test`,
          });
        } else if (isForbiddenSecret(secret)) {
          ctx.addIssue({
            code: "custom",
            path: [path],
            message: "secret must not contain a known placeholder",
          });
        }
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

export type AppNodeEnv = z.infer<typeof EnvSchema>["NODE_ENV"];

export function parseEnv(raw: Record<string, string | undefined>) {
  return EnvSchema.parse(raw);
}

export const env = parseEnv(process.env);

function parseProxyEntry(entry: string): string {
  const [address, prefix, extra] = entry.split("/");
  if (!address || extra !== undefined || isIP(address) === 0) {
    throw new Error("TRUST_PROXY must contain only IP addresses or CIDR ranges");
  }
  if (prefix === undefined) {
    return address;
  }
  if (!/^\d{1,3}$/.test(prefix)) {
    throw new Error("TRUST_PROXY contains an invalid CIDR prefix");
  }

  const maxPrefix = isIP(address) === 6 ? 128 : 32;
  const prefixNumber = Number(prefix);
  if (prefixNumber > maxPrefix) {
    throw new Error("TRUST_PROXY contains an invalid CIDR prefix");
  }
  return `${address}/${prefixNumber}`;
}

export type TrustProxyConfig = false | string;

export function resolveTrustProxy(nodeEnv: AppNodeEnv, raw: string | undefined): TrustProxyConfig {
  const value = raw?.trim();

  if (!value) {
    if (nodeEnv === "production") {
      throw new Error("TRUST_PROXY is required in production: set the Caddy IP/CIDR, not true");
    }
    return false;
  }
  if (value.toLowerCase() === "true") {
    throw new Error("TRUST_PROXY=true is not allowed: set explicit Caddy IP/CIDR");
  }
  if (value.toLowerCase() === "false") {
    return false;
  }

  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => entry.length === 0)) {
    throw new Error("TRUST_PROXY contains an empty entry");
  }
  return entries.map(parseProxyEntry).join(",");
}

export const trustProxy = resolveTrustProxy(env.NODE_ENV, env.TRUST_PROXY);
export const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;
export const otpSecret = env.OTP_SECRET ?? DEV_OTP_SECRET;
