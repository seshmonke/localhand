import { describe, expect, it, vi } from "vitest";
import { createSmsProvider } from "./sms-provider.js";

function phone(...parts: string[]): string {
  return parts.join("");
}

const TEST_PHONE = phone("+7", "999", "000", "00", "03");

describe("createSmsProvider", () => {
  it("fails on startup when dev adapter is used in production", () => {
    expect(() => createSmsProvider({ nodeEnv: "production", provider: "dev" })).toThrow(
      /not allowed in production/,
    );
  });

  it("returns devCode only outside production", async () => {
    const provider = createSmsProvider({ nodeEnv: "test", provider: "dev" });

    await expect(provider.sendCode({ phone: TEST_PHONE, code: "123456" })).resolves.toEqual({
      devCode: "123456",
    });
  });

  it("requires an API key for the smsru adapter", () => {
    expect(() => createSmsProvider({ nodeEnv: "production", provider: "smsru" })).toThrow(
      /SMSRU_API_ID/,
    );
  });

  it("sends sms through smsru without the key in the URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "OK", status_code: 100 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = createSmsProvider({
      nodeEnv: "production",
      provider: "smsru",
      smsruApiId: "test-api-id",
      fetchImpl,
    });

    await provider.sendCode({ phone: TEST_PHONE, code: "123456" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://sms.ru/sms/send");
    expect(String(url)).not.toContain("test-api-id");
    expect(init?.method).toBe("POST");
  });

  it("throws a generic error when smsru rejects the message", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "ERROR", status_code: 201 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = createSmsProvider({
      nodeEnv: "production",
      provider: "smsru",
      smsruApiId: "test-api-id",
      fetchImpl,
    });

    await expect(provider.sendCode({ phone: TEST_PHONE, code: "123456" })).rejects.toThrow(
      "SMS.ru rejected the message",
    );
  });
});
