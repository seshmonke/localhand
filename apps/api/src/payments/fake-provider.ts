import { randomUUID } from "node:crypto";
import { PaymentProviderError } from "./errors.js";
import type {
  CreateConnectionResult,
  CreateProviderPaymentInput,
  CreateProviderPaymentResult,
  ExchangeCodeResult,
  PaymentAccountInfo,
  PaymentProvider,
  ProviderPayment,
  ProviderPaymentStatus,
} from "./provider.js";

type FakePaymentRecord = {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amountKopecks: number;
  currency: "RUB";
  orderId: number;
  paymentId: number;
  idempotencyKey: string;
  paidAt?: Date;
};

export type FakePaymentProviderOptions = {
  enabled: boolean;
  webOrigin: string;
};

/**
 * Deterministic in-memory provider for dev/test/e2e. It never performs network
 * calls and never handles real money. `completePayment` is the test hook that
 * the dev-only HTTP endpoint and e2e will call in PR B.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake" as const;

  private readonly enabled: boolean;
  private readonly webOrigin: string;
  private readonly usedCodes = new Set<string>();
  private readonly accounts = new Map<string, PaymentAccountInfo>();
  private readonly webhookUrls = new Map<string, string>();
  private readonly payments = new Map<string, FakePaymentRecord>();
  private readonly idempotency = new Map<string, string>();

  constructor(options: FakePaymentProviderOptions) {
    this.enabled = options.enabled;
    this.webOrigin = options.webOrigin.replace(/\/+$/, "");
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new PaymentProviderError("disabled");
    }
  }

  private requireAccount(accessToken: string): PaymentAccountInfo {
    const account = this.accounts.get(accessToken);
    if (!account) {
      throw new PaymentProviderError("unauthorized");
    }
    return account;
  }

  private idempotencyKey(accessToken: string, key: string): string {
    return `${accessToken}\u0000${key}`;
  }

  private toResult(record: FakePaymentRecord): CreateProviderPaymentResult {
    return {
      providerPaymentId: record.providerPaymentId,
      status: record.status,
      confirmationUrl: `${this.webOrigin}/dev/payments/${record.providerPaymentId}/complete`,
    };
  }

  async createConnection(state: string): Promise<CreateConnectionResult> {
    this.assertEnabled();
    if (!state) {
      throw new PaymentProviderError("invalid_request");
    }
    return {
      consentUrl: `${this.webOrigin}/dev/payments/connect?state=${encodeURIComponent(state)}`,
    };
  }

  async exchangeCode(code: string): Promise<ExchangeCodeResult> {
    this.assertEnabled();
    if (!code) {
      throw new PaymentProviderError("invalid_request");
    }
    if (this.usedCodes.has(code)) {
      throw new PaymentProviderError("invalid_request");
    }
    this.usedCodes.add(code);

    const accessToken = `fake_access_${code}`;
    this.accounts.set(accessToken, { accountId: "fake-account-1", isTest: true });
    return { accessToken };
  }

  async getAccountInfo(accessToken: string): Promise<PaymentAccountInfo> {
    this.assertEnabled();
    return { ...this.requireAccount(accessToken) };
  }

  async subscribeWebhooks(accessToken: string, url: string): Promise<void> {
    this.assertEnabled();
    this.requireAccount(accessToken);
    if (!url) {
      throw new PaymentProviderError("invalid_request");
    }
    this.webhookUrls.set(accessToken, url);
  }

  async unsubscribeWebhooks(accessToken: string): Promise<void> {
    this.assertEnabled();
    this.webhookUrls.delete(accessToken);
  }

  async createPayment(
    accessToken: string,
    input: CreateProviderPaymentInput,
  ): Promise<CreateProviderPaymentResult> {
    this.assertEnabled();
    this.requireAccount(accessToken);

    if (
      !Number.isSafeInteger(input.amountKopecks) ||
      input.amountKopecks < 0 ||
      input.currency !== "RUB" ||
      !input.idempotencyKey ||
      !input.returnUrl ||
      input.capture !== true
    ) {
      throw new PaymentProviderError("invalid_request");
    }

    const lookup = this.idempotencyKey(accessToken, input.idempotencyKey);
    const existingId = this.idempotency.get(lookup);
    if (existingId) {
      const existing = this.payments.get(existingId);
      if (!existing) {
        throw new PaymentProviderError("provider_unavailable");
      }
      const samePayment =
        existing.orderId === input.orderId &&
        existing.paymentId === input.paymentId &&
        existing.amountKopecks === input.amountKopecks;
      if (!samePayment) {
        throw new PaymentProviderError("invalid_request");
      }
      return this.toResult(existing);
    }

    const record: FakePaymentRecord = {
      providerPaymentId: `fake_${randomUUID()}`,
      status: "pending",
      amountKopecks: input.amountKopecks,
      currency: input.currency,
      orderId: input.orderId,
      paymentId: input.paymentId,
      idempotencyKey: input.idempotencyKey,
    };
    this.payments.set(record.providerPaymentId, record);
    this.idempotency.set(lookup, record.providerPaymentId);
    return this.toResult(record);
  }

  async getPayment(accessToken: string, providerPaymentId: string): Promise<ProviderPayment> {
    this.assertEnabled();
    this.requireAccount(accessToken);

    const record = this.payments.get(providerPaymentId);
    if (!record) {
      throw new PaymentProviderError("not_found");
    }
    return {
      providerPaymentId: record.providerPaymentId,
      status: record.status,
      amountKopecks: record.amountKopecks,
      currency: record.currency,
      orderId: record.orderId,
      ...(record.paidAt === undefined ? {} : { paidAt: record.paidAt }),
    };
  }

  async revoke(accessToken: string): Promise<void> {
    this.assertEnabled();
    // Best effort: keep the account so old pending payments remain readable.
    this.webhookUrls.delete(accessToken);
  }

  /**
   * Test/dev hook. In PR B it backs `POST /dev/payments/:id/complete`; the
   * route itself is deliberately not part of the foundation PR.
   */
  completePayment(
    providerPaymentId: string,
    status: "succeeded" | "canceled" = "succeeded",
  ): ProviderPayment {
    this.assertEnabled();
    const record = this.payments.get(providerPaymentId);
    if (!record) {
      throw new PaymentProviderError("not_found");
    }
    if (record.status !== "pending") {
      return this.getPaymentSync(record);
    }
    record.status = status;
    record.paidAt = status === "succeeded" ? new Date() : undefined;
    return this.getPaymentSync(record);
  }

  private getPaymentSync(record: FakePaymentRecord): ProviderPayment {
    return {
      providerPaymentId: record.providerPaymentId,
      status: record.status,
      amountKopecks: record.amountKopecks,
      currency: record.currency,
      orderId: record.orderId,
      ...(record.paidAt === undefined ? {} : { paidAt: record.paidAt }),
    };
  }
}
