import { NextResponse, type NextRequest } from "next/server";

/**
 * The app has no login because it only listens on this machine. That makes
 * the Host header the security boundary: a malicious website could use DNS
 * rebinding to point its own domain at 127.0.0.1 and then call this app
 * same-origin (Next.js's CSRF check would pass, since Origin and Host would
 * match). Rejecting every non-loopback Host closes that hole.
 */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
  return LOOPBACK_HOSTNAMES.has(hostname);
}

export function proxy(request: NextRequest) {
  if (!isLoopbackHost(request.headers.get("host"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}
