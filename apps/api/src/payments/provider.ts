import { PaymentProviderError } from "./errors.js";
import { FakePaymentProvider } from "./fake-provider.js";

export type PaymentProviderName = "fake" | "yookassa";
export type PaymentEnvironment = "live" | "sandbox" | "test";
export type ProviderPaymentStatus = "pending" | "succeeded" | "canceled";

export type CreateConnectionResult = {
  consentUrl: string;
};

export type ExchangeCodeResult = {
  accessToken: string;
  expiresAt?: Date;
};

export type PaymentAccountInfo = {
  accountId: string;
  isTest: boolean;
};

export type CreateProviderPaymentInput = {
  amountKopecks: number;
  currency: "RUB";
  orderId: number;
  paymentId: number;
  idempotencyKey: string;
  returnUrl: string;
  capture: true;
};

export type CreateProviderPaymentResult = {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  confirmationUrl: string;
};

export type ProviderPayment = {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amountKopecks: number;
  currency: "RUB";
  orderId: number;
  paidAt?: Date;
};

export { PaymentProviderError } from "./errors.js";
export type { PaymentProviderErrorCode } from "./errors.js";

/**
 * Contract for a seller's payment provider. Tokens are passed explicitly and
 * must never be logged. The YooKassa adapter lands in PR B; the foundation
 * ships the interface and the deterministic fake.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createConnection(state: string): Promise<CreateConnectionResult>;
  exchangeCode(code: string): Promise<ExchangeCodeResult>;
  getAccountInfo(accessToken: string): Promise<PaymentAccountInfo>;
  subscribeWebhooks(accessToken: string, url: string): Promise<void>;
  unsubscribeWebhooks(accessToken: string): Promise<void>;
  createPayment(
    accessToken: string,
    input: CreateProviderPaymentInput,
  ): Promise<CreateProviderPaymentResult>;
  getPayment(accessToken: string, providerPaymentId: string): Promise<ProviderPayment>;
  revoke(accessToken: string): Promise<void>;
}

export type PaymentProviderConfig = {
  provider: PaymentProviderName | null;
  environment: PaymentEnvironment;
  fakeEnabled: boolean;
  /** Base URL of the web app for fake consent/complete pages. */
  webOrigin: string;
};

/**
 * Live forbids test seller accounts: their payments do not move real money.
 * Sandbox and test intentionally allow the test contour. PR B calls this when
 * it receives `getAccountInfo` and marks the new account version `error`.
 */
export function assertPaymentAccountAllowed(
  environment: PaymentEnvironment,
  account: { isTest: boolean },
): void {
  if (environment === "live" && account.isTest) {
    throw new PaymentProviderError("test_account_forbidden");
  }
}

/**
 * Selects a provider for the current environment. `null` means payments are
 * not configured. Fake is rejected in `live` even if env validation was
 * bypassed by a direct caller.
 */
export function createPaymentProvider(config: PaymentProviderConfig): PaymentProvider | null {
  if (config.provider === null) {
    return null;
  }
  if (config.provider === "fake") {
    if (config.environment === "live" || !config.fakeEnabled) {
      throw new PaymentProviderError("disabled");
    }
    return new FakePaymentProvider({ enabled: true, webOrigin: config.webOrigin });
  }

  // The HTTP client for YooKassa is PR B; failing here makes the missing
  // adapter explicit instead of silently accepting live traffic.
  throw new PaymentProviderError("not_implemented");
}
