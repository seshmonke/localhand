import type { AppNodeEnv } from "../../env.js";
import type { SmsProvider } from "./sms-provider.js";

export function createDevSmsProvider(input: { nodeEnv: AppNodeEnv }): SmsProvider {
  return {
    name: "dev",
    async sendCode({ code }) {
      if (input.nodeEnv === "production") {
        return {};
      }
      return { devCode: code };
    },
  };
}
