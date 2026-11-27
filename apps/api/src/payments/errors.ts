export type PaymentProviderErrorCode =
  | "disabled"
  | "unauthorized"
  | "not_found"
  | "invalid_request"
  | "provider_unavailable"
  | "not_implemented"
  | "test_account_forbidden";

export class PaymentProviderError extends Error {
  readonly code: PaymentProviderErrorCode;

  constructor(code: PaymentProviderErrorCode) {
    super(code);
    this.name = "PaymentProviderError";
    this.code = code;
  }
}
