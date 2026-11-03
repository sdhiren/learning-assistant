import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_IDLE_MS } from "@/server/auth/session-cookie";

/**
 * The app only listens on this machine, which makes the Host header a
 * security boundary: a malicious website could use DNS rebinding to point its
 * own domain at 127.0.0.1 and then call this app same-origin (Next.js's CSRF
 * check would pass, since Origin and Host would match). Rejecting every
 * non-loopback Host closes that hole. This check runs before anything else.
 */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/** Pages reachable without signing in. */
const PUBLIC_PATHS = new Set(["/login", "/register"]);

/** Whether a path needs a session. Framework assets and the favicon never do. */
export function requiresSession(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return false;
  return !pathname.startsWith("/_next/") && pathname !== "/favicon.ico";
}

/**
 * Host guard first, then an optimistic sign-in redirect when there is no
 * session cookie at all. The real check is `requireProfile()` in every page
 * and server action: a cookie that exists can still be expired or forged.
 */
export function proxy(request: NextRequest) {
  if (!isLoopbackHost(request.headers.get("host"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { pathname, search } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (!session && requiresSession(pathname)) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  // Sessions slide over 30 idle days on the server; keep the cookie in step.
  // Only page loads refresh it, so a sign-out action's deletion always wins.
  if (session && request.method === "GET" && requiresSession(pathname)) {
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_IDLE_MS / 1000,
    });
  }
  return response;
}
