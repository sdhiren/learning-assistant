import "server-only";

import { scrypt as scryptCallback, type ScryptOptions } from "node:crypto";

/** scrypt cost used for password hashes and password-derived keys (about 32 MB per call). */
export const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const MAX_MEMORY = 64 * 1024 * 1024;

/** Promise wrapper around node's scrypt, so hashing never blocks the event loop. */
export function scrypt(
  secret: string,
  salt: Buffer,
  keyLength: number,
  params: { N: number; r: number; p: number } = SCRYPT_PARAMS,
): Promise<Buffer> {
  const options: ScryptOptions = { ...params, maxmem: MAX_MEMORY };
  return new Promise((resolve, reject) => {
    scryptCallback(secret.normalize("NFKC"), salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}
