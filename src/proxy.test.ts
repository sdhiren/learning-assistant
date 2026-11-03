import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { isLoopbackHost, proxy, requiresSession } from "./proxy";

describe("isLoopbackHost", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST", "127.0.0.1"])(
    "allows %s",
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each([null, "", "evil.example:3000", "127.0.0.1.evil.example", "localhost.evil.example"])(
    "blocks %s (e.g. DNS rebinding)",
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});

describe("requiresSession", () => {
  it.each(["/login", "/register", "/_next/static/chunk.js", "/_next/image", "/favicon.ico"])(
    "lets %s through without signing in",
    (path) => {
      expect(requiresSession(path)).toBe(false);
    },
  );

  it.each(["/", "/topics/abc", "/quizzes/abc", "/settings/usage", "/login/extra", "/registered"])(
    "requires a session for %s",
    (path) => {
      expect(requiresSession(path)).toBe(true);
    },
  );
});

describe("proxy", () => {
  function request(url: string, init: { host?: string; cookie?: string; method?: string } = {}) {
    const headers = new Headers({ host: init.host ?? "127.0.0.1:3000" });
    if (init.cookie) headers.set("cookie", init.cookie);
    return new NextRequest(url, { method: init.method ?? "GET", headers });
  }

  it("runs the Host guard before anything else", () => {
    const response = proxy(request("http://127.0.0.1:3000/login", { host: "evil.example" }));
    expect(response.status).toBe(403);
  });

  it("redirects to /login with the requested path when there is no session cookie", () => {
    const response = proxy(request("http://127.0.0.1:3000/topics/abc?tab=1"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/topics/abc?tab=1");
  });

  it("lets /login and /register through without a cookie", () => {
    expect(proxy(request("http://127.0.0.1:3000/login")).headers.get("location")).toBeNull();
    expect(proxy(request("http://127.0.0.1:3000/register")).headers.get("location")).toBeNull();
  });

  it("refreshes the cookie on page loads but not on actions", () => {
    const page = proxy(request("http://127.0.0.1:3000/", { cookie: "la_session=abc" }));
    expect(page.headers.get("location")).toBeNull();
    expect(page.headers.get("set-cookie")).toMatch(/la_session=abc.*httponly/i);

    const action = proxy(
      request("http://127.0.0.1:3000/", { cookie: "la_session=abc", method: "POST" }),
    );
    expect(action.headers.get("set-cookie")).toBeNull();
  });
});
