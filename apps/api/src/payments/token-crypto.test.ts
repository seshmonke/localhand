import { describe, expect, it } from "vitest";
import {
  createTokenCipher,
  parseTokenKeyring,
  TokenCryptoError,
  TOKEN_HEADER_BYTES,
  TOKEN_IV_BYTES,
  TOKEN_TAG_BYTES,
} from "./token-crypto.js";

const KEY_ONE = Buffer.alloc(32, 1);
const KEY_TWO = Buffer.alloc(32, 2);

function keyring(entries: Record<number, Buffer>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(entries).map(([version, key]) => [version, key.toString("base64")]),
    ),
  );
}

function expectCryptoError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TokenCryptoError);
    expect((error as TokenCryptoError).code).toBe(code);
    return;
  }
  throw new Error("expected TokenCryptoError");
}

function flipByte(buffer: Buffer, index: number): void {
  buffer[index] = (buffer[index] ?? 0) ^ 0xff;
}

describe("parseTokenKeyring", () => {
  it("parses a JSON keyring of 32-byte base64 keys", () => {
    const parsed = parseTokenKeyring(keyring({ 1: KEY_ONE, 2: KEY_TWO }));

    expect([...parsed.keys()]).toEqual([1, 2]);
    expect(parsed.get(1)).toEqual(KEY_ONE);
    expect(parsed.get(2)).toEqual(KEY_TWO);
  });

  it.each([
    "not json",
    "null",
    "[]",
    "{}",
    JSON.stringify({ 1: "short" }),
    JSON.stringify({ 0: KEY_ONE.toString("base64") }),
    JSON.stringify({ 256: KEY_ONE.toString("base64") }),
    JSON.stringify({ abc: KEY_ONE.toString("base64") }),
    JSON.stringify({ 1: 42 }),
    JSON.stringify({ 1: "not base64!" }),
  ])("rejects an invalid keyring %#", (raw) => {
    expectCryptoError(() => parseTokenKeyring(raw), "invalid_keyring");
  });
});

describe("createTokenCipher", () => {
  const parsed = parseTokenKeyring(keyring({ 1: KEY_ONE, 2: KEY_TWO }));

  it("roundtrips a token and writes the version as the first byte", () => {
    const cipher = createTokenCipher(parsed, 1);
    const plaintext = "yookassa-access-token-Пример-1";
    const ciphertext = cipher.encrypt(plaintext);

    expect(ciphertext[0]).toBe(1);
    expect(ciphertext.length).toBe(TOKEN_HEADER_BYTES + Buffer.byteLength(plaintext));
    expect(cipher.decrypt(ciphertext)).toBe(plaintext);
  });

  it("roundtrips an empty token", () => {
    const cipher = createTokenCipher(parsed, 2);
    const ciphertext = cipher.encrypt("");

    expect(ciphertext[0]).toBe(2);
    expect(cipher.decrypt(ciphertext)).toBe("");
  });

  it("uses a fresh IV for every encryption", () => {
    const cipher = createTokenCipher(parsed, 1);
    const first = cipher.encrypt("same-token");
    const second = cipher.encrypt("same-token");

    expect(first.equals(second)).toBe(false);
    expect(first.subarray(1, 1 + TOKEN_IV_BYTES)).not.toEqual(
      second.subarray(1, 1 + TOKEN_IV_BYTES),
    );
  });

  it("rejects a current version missing from the keyring", () => {
    expectCryptoError(() => createTokenCipher(parsed, 3), "invalid_keyring");
  });

  it("rejects a truncated ciphertext", () => {
    const cipher = createTokenCipher(parsed, 1);
    const ciphertext = cipher.encrypt("token");

    expectCryptoError(
      () => cipher.decrypt(ciphertext.subarray(0, TOKEN_HEADER_BYTES - 1)),
      "invalid_ciphertext",
    );
  });

  it("rejects tampering with the tag, IV, ciphertext and version", () => {
    const cipher = createTokenCipher(parsed, 1);
    const ciphertext = cipher.encrypt("token-to-protect");

    const tamperedTag = Buffer.from(ciphertext);
    flipByte(tamperedTag, 1 + TOKEN_IV_BYTES);
    expectCryptoError(() => cipher.decrypt(tamperedTag), "decrypt_failed");

    const tamperedIv = Buffer.from(ciphertext);
    flipByte(tamperedIv, 1);
    expectCryptoError(() => cipher.decrypt(tamperedIv), "decrypt_failed");

    const tamperedBody = Buffer.from(ciphertext);
    flipByte(tamperedBody, TOKEN_HEADER_BYTES);
    expectCryptoError(() => cipher.decrypt(tamperedBody), "decrypt_failed");

    const tamperedVersion = Buffer.from(ciphertext);
    flipByte(tamperedVersion, 0);
    expectCryptoError(() => cipher.decrypt(tamperedVersion), "unknown_key_version");
  });

  it("rotates the key version without re-encrypting existing tokens", () => {
    const oldKeyring = parseTokenKeyring(keyring({ 1: KEY_ONE }));
    const versionOne = createTokenCipher(oldKeyring, 1);
    const versionTwo = createTokenCipher(parsed, 2);

    const oldCiphertext = versionOne.encrypt("old-token");
    expect(oldCiphertext[0]).toBe(1);
    expect(versionTwo.decrypt(oldCiphertext)).toBe("old-token");

    const newCiphertext = versionTwo.encrypt("new-token");
    expect(newCiphertext[0]).toBe(2);
    expect(versionTwo.decrypt(newCiphertext)).toBe("new-token");
    expectCryptoError(() => versionOne.decrypt(newCiphertext), "unknown_key_version");
  });

  it("fails authentication when the keyring maps the version to a wrong key", () => {
    const foreign = createTokenCipher(parseTokenKeyring(keyring({ 1: KEY_TWO })), 1);
    const original = createTokenCipher(parsed, 1).encrypt("token");

    expectCryptoError(() => foreign.decrypt(original), "decrypt_failed");
  });

  it("does not leak plaintext or key material in error messages", () => {
    const cipher = createTokenCipher(parsed, 1);
    const ciphertext = cipher.encrypt("super-secret-token");
    const tampered = Buffer.from(ciphertext);
    flipByte(tampered, TOKEN_TAG_BYTES);

    try {
      cipher.decrypt(tampered);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenCryptoError);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("super-secret-token");
      expect(serialized).not.toContain(KEY_ONE.toString("base64"));
    }
  });
});
