/**
 * Session cookie settings. Plain constants with no server-only imports, so
 * the proxy can share them.
 */

/** The cookie that carries the raw session token. */
export const SESSION_COOKIE = "la_session";

/** Sessions end after this long without use. */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
