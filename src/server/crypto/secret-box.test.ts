import { describe, expect, it } from "vitest";

import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/auth/password";
import { createSessionToken, hashSessionToken } from "@/server/auth/session-token";

import {
  DecryptionError,
  deriveKek,
  deriveSessionKey,
  generateDataKey,
  generateSalt,
  open,
  seal,
  unwrapKey,
  wrapKey,
} from "./secret-box";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[^$]+\$[^$]+$/);
    expect(hash).not.toContain("correct horse");
    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(true);
    await expect(verifyPassword("correct horse batterY", hash)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("never matches a malformed hash", async () => {
    await expect(verifyPassword("anything", "plain-text")).resolves.toBe(false);
    await expect(verifyPassword("anything", "scrypt$0$8$1$$")).resolves.toBe(false);
  });

  it("has a dummy hash that no ordinary password matches", async () => {
    await expect(verifyPassword("", await DUMMY_HASH)).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  it("are random and stored only as a SHA-256 hash", () => {
    const token = createSessionToken();
    expect(token).not.toBe(createSessionToken());
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });
});

describe("secret box", () => {
  const dek = generateDataKey();

  it("round-trips a secret with its AAD", () => {
    const box = seal(dek, "sk-secret-value", "profile-a:api_key:openai");
    expect(box.ciphertext).not.toContain("sk-secret");
    expect(open(dek, box, "profile-a:api_key:openai")).toBe("sk-secret-value");
  });

  it("uses a fresh IV for every seal", () => {
    expect(seal(dek, "x", "a").iv).not.toBe(seal(dek, "x", "a").iv);
  });

  it("rejects another profile's AAD, another key and tampered ciphertext", () => {
    const box = seal(dek, "sk-secret-value", "profile-a:api_key:openai");
    expect(() => open(dek, box, "profile-b:api_key:openai")).toThrow(DecryptionError);
    expect(() => open(generateDataKey(), box, "profile-a:api_key:openai")).toThrow(DecryptionError);
    const bytes = Buffer.from(box.ciphertext, "base64");
    bytes.writeUInt8(bytes.readUInt8(0) ^ 1, 0);
    const tampered = { ...box, ciphertext: bytes.toString("base64") };
    expect(() => open(dek, tampered, "profile-a:api_key:openai")).toThrow(DecryptionError);
  });

  it("wraps the data key with a password-derived key", async () => {
    const salt = generateSalt();
    const wrapped = wrapKey(await deriveKek("my long password", salt), dek);
    expect(unwrapKey(await deriveKek("my long password", salt), wrapped).equals(dek)).toBe(true);
    const wrongKek = await deriveKek("another password", salt);
    expect(() => unwrapKey(wrongKek, wrapped)).toThrow(DecryptionError);
  });

  it("wraps the data key per session, so only the raw token unwraps it", () => {
    const token = createSessionToken();
    const wrapped = wrapKey(deriveSessionKey(token), dek);
    expect(unwrapKey(deriveSessionKey(token), wrapped).equals(dek)).toBe(true);
    expect(() => unwrapKey(deriveSessionKey(createSessionToken()), wrapped)).toThrow(
      DecryptionError,
    );
    // The stored hash of the token is not a usable key.
    expect(() => unwrapKey(deriveSessionKey(hashSessionToken(token)), wrapped)).toThrow(
      DecryptionError,
    );
  });

  it("rejects a malformed wrapped key", () => {
    expect(() => unwrapKey(dek, "not-a-wrapped-key")).toThrow(DecryptionError);
  });
});
