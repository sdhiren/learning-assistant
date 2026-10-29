import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { runWithRequestContext } from "@/server/request-context";
import { FakeLlmClient } from "@/test/fake-llm-client";

import {
  classifyOutcome,
  InstrumentedLlmClient,
  type LlmCallRecord,
  type LlmCallSink,
} from "./instrumented-llm-client";
import type { StructuredRequest } from "./llm-client";
import { PROVIDER_ERROR_KINDS, ProviderError, type ProviderErrorKind } from "./provider-errors";

const request: StructuredRequest<{ ok: boolean }> = {
  task: "test-task",
  systemPrompt: "system",
  prompt: "prompt",
  schema: z.object({ ok: z.boolean() }),
  effort: "low",
  quizId: "quiz-1",
  conceptId: "concept-1",
};

const EXPECTED_OUTCOMES: Record<ProviderErrorKind, string> = {
  timeout: "timeout",
  refused: "refused",
  bad_output: "invalid_output",
  truncated: "invalid_output",
  invalid_key: "auth",
  no_credit: "auth",
  rate_limited: "rate_limited",
  overloaded: "rate_limited",
  unavailable: "error",
};

function setup(sink: LlmCallSink = { insert: vi.fn() }) {
  const fake = new FakeLlmClient("GPT");
  let ticks = 1000;
  const client = new InstrumentedLlmClient(fake, {
    provider: "openai",
    model: "gpt-5",
    sink,
    now: () => new Date("2026-10-01T12:00:00Z"),
    monotonic: () => (ticks += 250),
  });
  const records = () => vi.mocked(sink.insert).mock.calls.map(([record]) => record);
  return { fake, client, sink, records };
}

async function settle(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("classifyOutcome", () => {
  it.each(PROVIDER_ERROR_KINDS)("maps the %s kind", (kind) => {
    expect(classifyOutcome(new ProviderError(kind, "message"))).toBe(EXPECTED_OUTCOMES[kind]);
  });

  it("maps a ZodError to invalid_output and anything else to error", () => {
    expect(classifyOutcome(z.object({ a: z.string() }).safeParse({}).error)).toBe("invalid_output");
    expect(classifyOutcome(new Error("rate limited, timeout, refused"))).toBe("error");
    expect(classifyOutcome("not an error")).toBe("error");
  });
});

describe("InstrumentedLlmClient", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("records one ok row with usage, timings, ids and the provider label of the inner client", async () => {
    const { fake, client, records } = setup();
    fake.respondTo(
      "test-task",
      { ok: true },
      { usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: null } },
    );

    await expect(client.generateStructured(request)).resolves.toEqual({ ok: true });

    expect(client.providerLabel).toBe("GPT");
    expect(records()).toEqual([
      {
        id: expect.any(String),
        task: "test-task",
        provider: "openai",
        model: "gpt-5",
        startedAt: new Date("2026-10-01T12:00:00Z"),
        durationMs: 250,
        apiDurationMs: null,
        outcome: "ok",
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 2,
        cacheWriteTokens: null,
        costUsd: null,
        quizId: "quiz-1",
        conceptId: "concept-1",
        requestId: null,
      } satisfies LlmCallRecord,
    ]);
  });

  it("leaves usage null when the client never reports it", async () => {
    const { fake, client, records } = setup();
    fake.respondTo("test-task", { ok: true });

    await client.generateStructured(request);

    expect(records()[0]).toMatchObject({ inputTokens: null, outputTokens: null, costUsd: null });
  });

  it.each(PROVIDER_ERROR_KINDS)(
    "records one row for a %s failure and rethrows the same error",
    async (kind) => {
      const { fake, client, records } = setup();
      fake.failWith("test-task", kind);

      const error = await settle(client.generateStructured(request));

      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).kind).toBe(kind);
      expect(records()).toHaveLength(1);
      expect(records()[0]!.outcome).toBe(EXPECTED_OUTCOMES[kind]);
    },
  );

  it("records invalid_output for a ZodError and error for an unknown error", async () => {
    const { fake, client, records } = setup();
    fake.respondTo("test-task", { ok: "yes" });
    fake.respondTo("other", () => {
      throw new Error("boom");
    });

    await settle(client.generateStructured(request));
    await settle(client.generateStructured({ ...request, task: "other" }));

    expect(records().map((record) => record.outcome)).toEqual(["invalid_output", "error"]);
  });

  it("logs the finer kind at warn, e.g. no_credit stored as auth", async () => {
    const { fake, client, records } = setup();
    fake.failWith("test-task", "no_credit");

    await settle(client.generateStructured(request));

    expect(records()[0]!.outcome).toBe("auth");
    const line = JSON.parse(String(vi.mocked(console.warn).mock.calls.at(-1)![0]));
    expect(line).toMatchObject({
      level: "warn",
      msg: "llm.call",
      outcome: "auth",
      kind: "no_credit",
    });
  });

  it("never lets a failing sink change the result or the error", async () => {
    const sink = {
      insert: vi.fn(() => {
        throw new Error("SQLITE_BUSY");
      }),
    };
    const { fake, client } = setup(sink);
    fake.respondTo("test-task", { ok: true });
    fake.failWith("fails", "timeout");

    await expect(client.generateStructured(request)).resolves.toEqual({ ok: true });
    const error = await settle(client.generateStructured({ ...request, task: "fails" }));
    expect((error as ProviderError).kind).toBe("timeout");
    const warnings = vi.mocked(console.warn).mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(warnings.some((line) => line.msg === "Failed to record AI call")).toBe(true);
  });

  it("stores the request id of the surrounding action", async () => {
    const { fake, client, records } = setup();
    fake.respondTo("test-task", { ok: true });

    await runWithRequestContext("testAction", () => client.generateStructured(request));

    const line = JSON.parse(String(vi.mocked(console.info).mock.calls.at(-1)![0]));
    expect(records()[0]!.requestId).toEqual(expect.any(String));
    expect(line.requestId).toBe(records()[0]!.requestId);
    expect(line.action).toBe("testAction");
  });
});
