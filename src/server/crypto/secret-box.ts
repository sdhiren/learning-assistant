import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { scrypt } from "./scrypt";

/**
 * Envelope encryption for profile secrets, using node:crypto only.
 *
 * Each profile has a random 32-byte data key (DEK). Secrets are sealed with
 * AES-256-GCM under the DEK. The DEK itself is only ever stored wrapped:
 * by a key derived from the password (scrypt) and, per session, by a key
 * derived from the raw session token (HKDF), which the database never sees.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SESSION_KEY_INFO = "la-dek-v1";
const WRAP_AAD = "la-dek-wrap-v1";
const WRAPPED_PREFIX = "v1";

export interface SealedBox {
  ciphertext: string;
  iv: string;
  tag: string;
}

/** Thrown when a box or wrapped key can't be opened (wrong key, wrong AAD or tampering). */
export class DecryptionError extends Error {
  constructor() {
    super("Could not decrypt");
    this.name = "DecryptionError";
  }
}

export function generateDataKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

export function generateSalt(): Buffer {
  return randomBytes(16);
}

/** The key-encryption key derived from a password. Use a salt distinct from the password hash's. */
export function deriveKek(password: string, salt: Buffer): Promise<Buffer> {
  return scrypt(password, salt, KEY_LENGTH);
}

/** The key that wraps the DEK for one session, derived from the raw (unhashed) session token. */
export function deriveSessionKey(rawToken: string): Buffer {
  return Buffer.from(hkdfSync("sha256", rawToken, Buffer.alloc(0), SESSION_KEY_INFO, KEY_LENGTH));
}

export function seal(key: Buffer, plaintext: string, aad: string): SealedBox {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function open(key: Buffer, box: SealedBox, aad: string): string {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(box.iv, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(box.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(box.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new DecryptionError();
  }
}

/** Wraps a data key as `v1.<iv>.<tag>.<ciphertext>`. */
export function wrapKey(kek: Buffer, dek: Buffer): string {
  const box = seal(kek, dek.toString("base64"), WRAP_AAD);
  return [WRAPPED_PREFIX, box.iv, box.tag, box.ciphertext].join(".");
}

export function unwrapKey(kek: Buffer, wrapped: string): Buffer {
  const [prefix, iv, tag, ciphertext] = wrapped.split(".");
  if (prefix !== WRAPPED_PREFIX || !iv || !tag || !ciphertext) throw new DecryptionError();
  return Buffer.from(open(kek, { iv, tag, ciphertext }, WRAP_AAD), "base64");
}
