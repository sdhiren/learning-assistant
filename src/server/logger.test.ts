import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger";
import { runWithRequestContext } from "./request-context";

const methods = ["log", "info", "warn", "error"] as const;

function lines(): Record<string, unknown>[] {
  return methods.flatMap((method) =>
    vi.mocked(console[method]).mock.calls.map((call) => {
      expect(call).toHaveLength(1);
      return JSON.parse(String(call[0])) as Record<string, unknown>;
    }),
  );
}

describe("logger", () => {
  beforeEach(() => {
    for (const method of methods) vi.spyOn(console, method).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes one JSON object per event with ts, level, msg and context", () => {
    logger.info("hello", { task: "t" });
    logger.error("failed", new Error("boom"));

    const [info, error] = lines().sort((a) => (a.level === "info" ? -1 : 1));
    expect(info).toMatchObject({ level: "info", msg: "hello", task: "t" });
    expect(new Date(String(info!.ts)).toString()).not.toBe("Invalid Date");
    expect(error).toMatchObject({
      level: "error",
      msg: "failed",
      error: { name: "Error", message: "boom" },
    });
  });

  it("adds the requestId and action inside a request context", () => {
    runWithRequestContext("createTopic", () => logger.warn("inside"));
    logger.warn("outside");

    const [inside, outside] = lines();
    expect(inside).toMatchObject({ action: "createTopic", requestId: expect.any(String) });
    expect(outside).not.toHaveProperty("requestId");
  });

  it("filters by LOG_LEVEL and defaults to info", () => {
    logger.debug("hidden by default");
    vi.stubEnv("LOG_LEVEL", "warn");
    logger.info("hidden");
    logger.warn("shown");
    vi.stubEnv("LOG_LEVEL", "debug");
    logger.debug("debug shown");

    expect(lines().map((line) => line.msg)).toEqual(["debug shown", "shown"]);
  });

  it("falls back to info for an invalid LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    logger.debug("hidden");
    logger.info("shown");

    expect(lines().map((line) => line.msg)).toContain("shown");
    expect(lines().map((line) => line.msg)).not.toContain("hidden");
  });

  it("redacts key-shaped strings and survives circular context", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    logger.info("key sk-ant-api03-SECRETSECRET", { circular });

    const raw = String(vi.mocked(console.info).mock.calls[0]![0]);
    expect(raw).not.toContain("SECRETSECRET");
    expect(JSON.parse(raw).circular.self).toBe("[circular]");
  });
});
