import "server-only";

import { createHash, randomBytes } from "node:crypto";

export { SESSION_COOKIE, SESSION_IDLE_MS } from "./session-cookie";

/** A new random 32-byte session token (base64url). Only the browser keeps it. */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the registry stores in place of the token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
