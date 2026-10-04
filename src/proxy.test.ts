import { describe, expect, it } from "vitest";

import { isLoopbackHost } from "./proxy";

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
