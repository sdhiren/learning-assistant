import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { scrypt, SCRYPT_PARAMS } from "@/server/crypto/scrypt";

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** Hashes a password as `scrypt$N$r$p$salt$hash` (salt and hash in base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = SCRYPT_PARAMS;
  const hash = await scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");
}

/** Checks a password against a stored hash in constant time. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (!N || !r || !p || salt.length === 0 || expected.length === 0) return false;

  const actual = await scrypt(password, salt, expected.length, { N, r, p });
  return timingSafeEqual(actual, expected);
}

/**
 * A valid hash of a random password. Checking unknown usernames against it
 * makes them take as long as known ones, so timing doesn't reveal which exist.
 */
export const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));
