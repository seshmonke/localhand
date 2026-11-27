import type { AppNodeEnv } from "../../env.js";
import { createDevSmsProvider } from "./dev-sms.provider.js";
import { createSmsruProvider } from "./smsru.provider.js";

export type SmsProviderName = "dev" | "smsru";

export type SendCodeInput = {
  phone: string;
  code: string;
};

export type SendCodeResult = {
  devCode?: string;
};

export interface SmsProvider {
  readonly name: SmsProviderName;
  sendCode(input: SendCodeInput): Promise<SendCodeResult>;
}

export type SmsProviderConfig = {
  nodeEnv: AppNodeEnv;
  provider: SmsProviderName;
  smsruApiId?: string | undefined;
  fetchImpl?: typeof fetch;
};

export function createSmsProvider(config: SmsProviderConfig): SmsProvider {
  if (config.nodeEnv === "production" && config.provider === "dev") {
    throw new Error("SMS_PROVIDER=dev is not allowed in production");
  }

  if (config.provider === "smsru") {
    if (!config.smsruApiId) {
      throw new Error("SMSRU_API_ID is required when SMS_PROVIDER=smsru");
    }
    return createSmsruProvider({
      apiId: config.smsruApiId,
      fetchImpl: config.fetchImpl ?? fetch,
    });
  }

  return createDevSmsProvider({ nodeEnv: config.nodeEnv });
}
