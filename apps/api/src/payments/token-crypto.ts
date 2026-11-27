import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Ciphertext layout: `version(1) || iv(12) || tag(16) || ciphertext`.
 * The version byte selects the key from the keyring, so rotating
 * `PAYMENTS_TOKEN_KEY_VERSION` does not break tokens encrypted with an older
 * key that is still in the keyring.
 */
export const TOKEN_VERSION_BYTES = 1;
export const TOKEN_IV_BYTES = 12;
export const TOKEN_TAG_BYTES = 16;
const TOKEN_KEY_BYTES = 32;
export const TOKEN_HEADER_BYTES = TOKEN_VERSION_BYTES + TOKEN_IV_BYTES + TOKEN_TAG_BYTES;
const MAX_TOKEN_KEY_VERSION = 255;

export type TokenKeyring = ReadonlyMap<number, Buffer>;

export type TokenCryptoErrorCode =
  "invalid_keyring" | "unknown_key_version" | "invalid_ciphertext" | "decrypt_failed";

export class TokenCryptoError extends Error {
  readonly code: TokenCryptoErrorCode;

  constructor(code: TokenCryptoErrorCode) {
    super(code);
    this.name = "TokenCryptoError";
    this.code = code;
  }
}

function parseKeyVersion(rawKey: string): number {
  if (!/^[1-9]\d*$/.test(rawKey)) {
    throw new TokenCryptoError("invalid_keyring");
  }
  const version = Number(rawKey);
  if (!Number.isSafeInteger(version) || version > MAX_TOKEN_KEY_VERSION) {
    throw new TokenCryptoError("invalid_keyring");
  }
  return version;
}

function parseKeyValue(rawValue: unknown): Buffer {
  if (typeof rawValue !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(rawValue)) {
    throw new TokenCryptoError("invalid_keyring");
  }
  const key = Buffer.from(rawValue, "base64");
  if (key.length !== TOKEN_KEY_BYTES) {
    throw new TokenCryptoError("invalid_keyring");
  }
  return key;
}

/**
 * Parses `PAYMENTS_TOKEN_KEYS` — JSON `{"1":"base64-32-byte-key", ...}`.
 * Keys are never logged; errors carry only `invalid_keyring`.
 */
export function parseTokenKeyring(raw: string): TokenKeyring {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TokenCryptoError("invalid_keyring");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TokenCryptoError("invalid_keyring");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new TokenCryptoError("invalid_keyring");
  }

  const keyring = new Map<number, Buffer>();
  for (const [rawVersion, rawKey] of entries) {
    const version = parseKeyVersion(rawVersion);
    if (keyring.has(version)) {
      throw new TokenCryptoError("invalid_keyring");
    }
    keyring.set(version, parseKeyValue(rawKey));
  }
  return keyring;
}

export type TokenCipher = {
  readonly currentVersion: number;
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
};

export function assertKeyringHasVersion(keyring: TokenKeyring, version: number): void {
  if (!Number.isInteger(version) || version < 1 || version > MAX_TOKEN_KEY_VERSION) {
    throw new TokenCryptoError("invalid_keyring");
  }
  if (!keyring.has(version)) {
    throw new TokenCryptoError("invalid_keyring");
  }
}

/**
 * Creates an AES-256-GCM cipher for seller payment tokens. Plaintext and key
 * material must never reach logs, responses or the database.
 */
export function createTokenCipher(keyring: TokenKeyring, currentVersion: number): TokenCipher {
  assertKeyringHasVersion(keyring, currentVersion);
  const currentKey = keyring.get(currentVersion);
  if (!currentKey) {
    throw new TokenCryptoError("invalid_keyring");
  }

  return {
    currentVersion,
    encrypt(plaintext: string): Buffer {
      const iv = randomBytes(TOKEN_IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", currentKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([Buffer.from([currentVersion]), iv, tag, encrypted]);
    },
    decrypt(ciphertext: Buffer): string {
      if (ciphertext.length < TOKEN_HEADER_BYTES) {
        throw new TokenCryptoError("invalid_ciphertext");
      }

      const version = ciphertext[0];
      if (version === undefined) {
        throw new TokenCryptoError("invalid_ciphertext");
      }
      const key = keyring.get(version);
      if (!key) {
        throw new TokenCryptoError("unknown_key_version");
      }

      const iv = ciphertext.subarray(TOKEN_VERSION_BYTES, TOKEN_VERSION_BYTES + TOKEN_IV_BYTES);
      const tag = ciphertext.subarray(TOKEN_VERSION_BYTES + TOKEN_IV_BYTES, TOKEN_HEADER_BYTES);
      const encrypted = ciphertext.subarray(TOKEN_HEADER_BYTES);

      try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      } catch {
        throw new TokenCryptoError("decrypt_failed");
      }
    },
  };
}
