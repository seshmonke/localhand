import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SmsProvider } from "./sms/sms-provider.js";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

function phone(...parts: string[]): string {
  return parts.join("");
}

const VALID_PHONE = phone("+7", "999", "222", "33", "44");
const WRONG_CODE_PHONE = phone("+7", "999", "222", "33", "45");
const EXPIRED_PHONE = phone("+7", "999", "222", "33", "46");
const CONSUMED_PHONE = phone("+7", "999", "222", "33", "47");
const ATTEMPTS_PHONE = phone("+7", "999", "222", "33", "48");
const RETURNING_PHONE = phone("+7", "999", "222", "33", "49");
const WRONG_CODE = "654321";

type AuthServiceModule = typeof import("./auth.service.js");
type DbClientModule = typeof import("../db/client.js");

let authService!: AuthServiceModule;
let dbClient!: DbClientModule;

function createCapturingProvider(): { provider: SmsProvider; sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    provider: {
      name: "dev",
      async sendCode({ code }) {
        sent.push(code);
        return { devCode: code };
      },
    },
  };
}

async function issueCode(targetPhone: string): Promise<string> {
  const { provider, sent } = createCapturingProvider();
  const result = await authService.requestCode({ phone: targetPhone }, { smsProvider: provider });

  expect(result.devCode).toBe(sent[0]);
  expect(sent[0]).toMatch(/^\d{6}$/);
  return sent[0] ?? "";
}

async function readOtpRow(targetPhone: string) {
  const result = await dbClient.requirePool().query<{
    code_hash: string;
    attempts: number;
    consumed_at: Date | null;
    expires_at: Date;
  }>("SELECT code_hash, attempts, consumed_at, expires_at FROM otp_codes WHERE phone = $1 ORDER BY id DESC LIMIT 1", [targetPhone]);
  return result.rows[0];
}

async function countUsers(): Promise<number> {
  const result = await dbClient
    .requirePool()
    .query<{ count: number }>("SELECT count(*)::int AS count FROM users");
  return result.rows[0]?.count ?? 0;
}

describeWithDb("auth.service with a real database", () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    dbClient = await import("../db/client.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbClient.requireDb(), { migrationsFolder });
    authService = await import("./auth.service.js");
  });

  afterAll(async () => {
    await dbClient?.requirePool().end();
  });

  beforeEach(async () => {
    await dbClient.requirePool().query("TRUNCATE TABLE otp_codes, users RESTART IDENTITY CASCADE");
  });

  it("accepts a valid code, stores only its hash and creates the user", async () => {
    const code = await issueCode(VALID_PHONE);

    const user = await authService.verifyCode({ phone: VALID_PHONE, code });

    expect(user).toEqual({ id: 1, phone: VALID_PHONE });
    expect(await countUsers()).toBe(1);

    const otp = await readOtpRow(VALID_PHONE);
    expect(otp?.code_hash).not.toBe(code);
    expect(otp?.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(otp?.consumed_at).not.toBeNull();
  });

  it("rejects a wrong code and counts the attempt", async () => {
    await issueCode(WRONG_CODE_PHONE);

    const user = await authService.verifyCode({ phone: WRONG_CODE_PHONE, code: WRONG_CODE });

    expect(user).toBeNull();
    expect(await countUsers()).toBe(0);

    const otp = await readOtpRow(WRONG_CODE_PHONE);
    expect(otp?.attempts).toBe(1);
    expect(otp?.consumed_at).toBeNull();
  });

  it("rejects an expired code without consuming it", async () => {
    const code = await issueCode(EXPIRED_PHONE);
    await dbClient
      .requirePool()
      .query("UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE phone = $1", [
        EXPIRED_PHONE,
      ]);

    const user = await authService.verifyCode({ phone: EXPIRED_PHONE, code });

    expect(user).toBeNull();
    const otp = await readOtpRow(EXPIRED_PHONE);
    expect(otp?.attempts).toBe(0);
    expect(otp?.consumed_at).toBeNull();
  });

  it("rejects a consumed code", async () => {
    const code = await issueCode(CONSUMED_PHONE);
    const user = await authService.verifyCode({ phone: CONSUMED_PHONE, code });
    expect(user).not.toBeNull();

    const replay = await authService.verifyCode({ phone: CONSUMED_PHONE, code });

    expect(replay).toBeNull();
    expect(await countUsers()).toBe(1);
  });

  it("rejects the correct code after five failed attempts", async () => {
    const code = await issueCode(ATTEMPTS_PHONE);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const user = await authService.verifyCode({ phone: ATTEMPTS_PHONE, code: WRONG_CODE });
      expect(user).toBeNull();
    }

    const otpAfterAttempts = await readOtpRow(ATTEMPTS_PHONE);
    expect(otpAfterAttempts?.attempts).toBe(5);

    const user = await authService.verifyCode({ phone: ATTEMPTS_PHONE, code });

    expect(user).toBeNull();
    expect(await countUsers()).toBe(0);
    expect((await readOtpRow(ATTEMPTS_PHONE))?.consumed_at).toBeNull();
  });

  it("creates one user on the first login and reuses it on the next", async () => {
    const firstCode = await issueCode(RETURNING_PHONE);
    const firstUser = await authService.verifyCode({ phone: RETURNING_PHONE, code: firstCode });
    expect(firstUser).toEqual({ id: 1, phone: RETURNING_PHONE });

    const secondCode = await issueCode(RETURNING_PHONE);
    const secondUser = await authService.verifyCode({ phone: RETURNING_PHONE, code: secondCode });

    expect(secondUser).toEqual({ id: 1, phone: RETURNING_PHONE });
    expect(await countUsers()).toBe(1);

    const otpCount = await dbClient
      .requirePool()
      .query<{ count: number }>("SELECT count(*)::int AS count FROM otp_codes");
    expect(otpCount.rows[0]?.count).toBe(2);
  });
});
