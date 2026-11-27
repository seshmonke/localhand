import type { FastifyInstance } from "fastify";
import type { PaymentsSettings } from "../env.js";
import { createPaymentProvider, type PaymentProvider } from "./provider.js";
import { createTokenCipher, type TokenCipher } from "./token-crypto.js";

export type PaymentsRuntime = {
  provider: PaymentProvider;
  cipher: TokenCipher;
  settings: PaymentsSettings;
  webhookUrl: string;
  webOrigin: string;
  /**
   * One-time OAuth state values already accepted by a callback. The TTL is
   * short (10 minutes); expired entries are pruned lazily.
   */
  consumedStates: Map<string, number>;
};

export type PaymentsRuntimeOptions = {
  settings: PaymentsSettings | null;
  webOrigin: string;
  /** Test seam: one provider instance per app, never constructed in a route. */
  provider?: PaymentProvider;
};

/**
 * Builds the single provider/cipher pair owned by one Fastify instance.
 * Routes, the webhook and reconcile read this object from `app.payments`, so
 * the fake provider's in-memory accounts and payments are shared by every
 * entry point instead of being recreated per request.
 */
export function createPaymentsRuntime(options: PaymentsRuntimeOptions): PaymentsRuntime | null {
  const { settings } = options;
  if (!settings) {
    return null;
  }

  const provider =
    options.provider ??
    createPaymentProvider({
      provider: settings.provider,
      environment: settings.environment,
      fakeEnabled: settings.fakeEnabled,
      webOrigin: options.webOrigin,
    });
  if (!provider) {
    return null;
  }

  return {
    provider,
    cipher: createTokenCipher(settings.tokenKeyring, settings.tokenKeyVersion),
    settings,
    webhookUrl: settings.webhookUrl,
    webOrigin: options.webOrigin,
    consumedStates: new Map(),
  };
}

declare module "fastify" {
  interface FastifyInstance {
    /** `null` when no payment provider is configured. Decorated once in `buildApp`. */
    payments: PaymentsRuntime | null;
  }
}

export type PaymentsApp = FastifyInstance & { payments: PaymentsRuntime | null };
