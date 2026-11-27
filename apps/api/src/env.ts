import path from "node:path";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";
import { parseTokenKeyring, type TokenKeyring } from "./payments/token-crypto.js";

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

const BooleanFlagSchema = z
  .preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false"))
  .transform((value) => value === "true");

const PAYMENT_ENVIRONMENTS = ["live", "sandbox", "test"] as const;

const RedirectUriSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  },
  { message: "YOOKASSA_REDIRECT_URI must be an http(s) URL" },
);

const WebhookUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  },
  { message: "PAYMENTS_WEBHOOK_URL must be an http(s) URL" },
);

function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isLiveRedirectUriAllowed(raw: string): boolean {
  const url = new URL(raw);
  return url.protocol === "https:" || isLocalhost(url.hostname);
}

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
    PAYMENTS_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["fake", "yookassa"]).optional()),
    PAYMENTS_ENV: z.enum(PAYMENT_ENVIRONMENTS).default("live"),
    PAYMENTS_FAKE_ENABLED: BooleanFlagSchema,
    PAYMENTS_STATE_SECRET: OptionalSecretSchema,
    PAYMENTS_TOKEN_KEYS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    PAYMENTS_TOKEN_KEY_VERSION: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().positive().optional(),
    ),
    YOOKASSA_REDIRECT_URI: z.preprocess(emptyToUndefined, RedirectUriSchema.optional()),
    PAYMENTS_WEBHOOK_URL: z.preprocess(emptyToUndefined, WebhookUrlSchema.optional()),
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

    if (value.NODE_ENV === "production") {
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
    }

    if (value.PAYMENTS_STATE_SECRET && isForbiddenSecret(value.PAYMENTS_STATE_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_STATE_SECRET"],
        message: "secret must not contain a known placeholder",
      });
    }

    // `PAYMENTS_ENV=live` is the default, so an empty config never enables the
    // test contour by accident. Fake must be opted into and never allowed live.
    if (value.PAYMENTS_ENV === "live" && value.PAYMENTS_FAKE_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_FAKE_ENABLED"],
        message: "PAYMENTS_FAKE_ENABLED is not allowed when PAYMENTS_ENV=live",
      });
    }

    let tokenKeyring: TokenKeyring | null = null;
    if (value.PAYMENTS_TOKEN_KEYS !== undefined) {
      try {
        tokenKeyring = parseTokenKeyring(value.PAYMENTS_TOKEN_KEYS);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENTS_TOKEN_KEYS"],
          message: "PAYMENTS_TOKEN_KEYS must be a JSON object of base64 32-byte keys",
        });
      }
    }

    if (value.PAYMENTS_TOKEN_KEYS !== undefined) {
      if (value.PAYMENTS_TOKEN_KEY_VERSION === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENTS_TOKEN_KEY_VERSION"],
          message: "PAYMENTS_TOKEN_KEY_VERSION is required when PAYMENTS_TOKEN_KEYS is set",
        });
      } else if (tokenKeyring && !tokenKeyring.has(value.PAYMENTS_TOKEN_KEY_VERSION)) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENTS_TOKEN_KEY_VERSION"],
          message: "PAYMENTS_TOKEN_KEY_VERSION must reference a key in PAYMENTS_TOKEN_KEYS",
        });
      }
    } else if (value.PAYMENTS_TOKEN_KEY_VERSION !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_TOKEN_KEYS"],
        message: "PAYMENTS_TOKEN_KEYS is required when PAYMENTS_TOKEN_KEY_VERSION is set",
      });
    }

    // The provider calls this URL with events: a live deployment must expose
    // https (localhost is the local exception used by sandbox/test). HTTP is
    // never accepted on a public host in live.
    if (
      value.PAYMENTS_WEBHOOK_URL &&
      value.PAYMENTS_ENV === "live" &&
      !isLiveRedirectUriAllowed(value.PAYMENTS_WEBHOOK_URL)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_WEBHOOK_URL"],
        message:
          "PAYMENTS_WEBHOOK_URL must use https in PAYMENTS_ENV=live; http is allowed only for localhost",
      });
    }

    if (value.PAYMENTS_PROVIDER === undefined) {
      return;
    }

    if (!value.PAYMENTS_WEBHOOK_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_WEBHOOK_URL"],
        message: "PAYMENTS_WEBHOOK_URL is required when a payment provider is configured",
      });
    }

    if (!value.PAYMENTS_STATE_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_STATE_SECRET"],
        message: "PAYMENTS_STATE_SECRET is required when a payment provider is configured",
      });
    }
    if (value.PAYMENTS_TOKEN_KEYS === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_TOKEN_KEYS"],
        message: "PAYMENTS_TOKEN_KEYS is required when a payment provider is configured",
      });
    }
    if (value.PAYMENTS_TOKEN_KEY_VERSION === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_TOKEN_KEY_VERSION"],
        message: "PAYMENTS_TOKEN_KEY_VERSION is required when a payment provider is configured",
      });
    }

    if (value.PAYMENTS_PROVIDER === "fake") {
      if (value.PAYMENTS_ENV === "live") {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENTS_PROVIDER"],
          message: "PAYMENTS_PROVIDER=fake is not allowed when PAYMENTS_ENV=live",
        });
      }
      if (!value.PAYMENTS_FAKE_ENABLED) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENTS_FAKE_ENABLED"],
          message: "PAYMENTS_FAKE_ENABLED=true is required for the fake provider",
        });
      }
    }

    if (value.PAYMENTS_PROVIDER === "yookassa" && !value.YOOKASSA_REDIRECT_URI) {
      ctx.addIssue({
        code: "custom",
        path: ["YOOKASSA_REDIRECT_URI"],
        message: "YOOKASSA_REDIRECT_URI is required for the yookassa provider",
      });
    }

    if (
      value.PAYMENTS_PROVIDER === "yookassa" &&
      value.PAYMENTS_ENV === "live" &&
      value.YOOKASSA_REDIRECT_URI &&
      !isLiveRedirectUriAllowed(value.YOOKASSA_REDIRECT_URI)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["YOOKASSA_REDIRECT_URI"],
        message:
          "YOOKASSA_REDIRECT_URI must use https in PAYMENTS_ENV=live; http is allowed only for localhost",
      });
    }
  });

export type AppNodeEnv = z.infer<typeof EnvSchema>["NODE_ENV"];
export type ParsedEnv = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>) {
  return EnvSchema.parse(raw);
}

export type PaymentsSettings = {
  provider: "fake" | "yookassa";
  environment: (typeof PAYMENT_ENVIRONMENTS)[number];
  fakeEnabled: boolean;
  stateSecret: string;
  tokenKeyring: TokenKeyring;
  tokenKeyVersion: number;
  yookassaRedirectUri: string | null;
  webhookUrl: string;
};

/**
 * Returns the validated payments block or `null` when no provider is
 * configured. Secrets stay in memory: callers must never log this object.
 */
export function resolvePaymentsSettings(parsed: ParsedEnv): PaymentsSettings | null {
  if (!parsed.PAYMENTS_PROVIDER) {
    return null;
  }

  const {
    PAYMENTS_STATE_SECRET,
    PAYMENTS_TOKEN_KEYS,
    PAYMENTS_TOKEN_KEY_VERSION,
    PAYMENTS_WEBHOOK_URL,
  } = parsed;
  if (
    PAYMENTS_STATE_SECRET === undefined ||
    PAYMENTS_TOKEN_KEYS === undefined ||
    PAYMENTS_TOKEN_KEY_VERSION === undefined ||
    PAYMENTS_WEBHOOK_URL === undefined
  ) {
    throw new Error("payments env invariant violated");
  }

  return {
    provider: parsed.PAYMENTS_PROVIDER,
    environment: parsed.PAYMENTS_ENV,
    fakeEnabled: parsed.PAYMENTS_FAKE_ENABLED,
    stateSecret: PAYMENTS_STATE_SECRET,
    tokenKeyring: parseTokenKeyring(PAYMENTS_TOKEN_KEYS),
    tokenKeyVersion: PAYMENTS_TOKEN_KEY_VERSION,
    yookassaRedirectUri: parsed.YOOKASSA_REDIRECT_URI ?? null,
    webhookUrl: PAYMENTS_WEBHOOK_URL,
  };
}

export const env = parseEnv(process.env);
export const paymentsSettings = resolvePaymentsSettings(env);

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
