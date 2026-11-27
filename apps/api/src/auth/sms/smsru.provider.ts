import type { SmsProvider } from "./sms-provider.js";

const SMSRU_ENDPOINT = "https://sms.ru/sms/send";
const SMSRU_TIMEOUT_MS = 5000;

type SmsruResponse = {
  status?: string;
  status_code?: number;
};

export function createSmsruProvider(input: {
  apiId: string;
  fetchImpl: typeof fetch;
}): SmsProvider {
  return {
    name: "smsru",
    async sendCode({ phone, code }) {
      const response = await input.fetchImpl(SMSRU_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_id: input.apiId,
          to: phone.replace(/^\+/, ""),
          msg: `Local Hand: код подтверждения ${code}. Никому не сообщайте.`,
          json: 1,
        }),
        signal: AbortSignal.timeout(SMSRU_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error("SMS.ru request failed");
      }

      const data = (await response.json()) as SmsruResponse;
      if (data.status !== "OK" || data.status_code !== 100) {
        throw new Error("SMS.ru rejected the message");
      }

      return {};
    },
  };
}
