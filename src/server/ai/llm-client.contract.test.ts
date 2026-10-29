import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { z } from "zod";

import { AiGenerationError } from "@/lib/errors";
import { hangingFetch } from "@/test/anthropic-fetch";
import { PROVIDER_HARNESSES, type HttpErrorKind } from "@/test/provider-harness";
import { SCHEMA_FIXTURES } from "@/test/schema-fixtures";

import type { StructuredRequest } from "./llm-client";
import { mapProviderError, ProviderError, type ProviderErrorKind } from "./provider-errors";
import { AI_SCHEMAS, type AiSchemaName } from "./schemas";

/**
 * The behaviour every API-key LlmClient shares: each schema round-trips, and
 * every failure maps to the same friendly AiGenerationError without leaking
 * the key. Each provider's wire format lives in `src/test/provider-harness.ts`.
 */

const request: StructuredRequest<{ answer: string }> = {
  task: "contract-test",
  systemPrompt: "You are a test persona.",
  prompt: "Say hi.",
  schema: z.object({ answer: z.string() }),
  effort: "medium",
};

function requestFor(name: AiSchemaName): StructuredRequest<unknown> {
  return { ...request, task: `contract-${name}`, schema: AI_SCHEMAS[name] };
}

async function failureOf(promise: Promise<unknown>): Promise<AiGenerationError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AiGenerationError);
  return error as AiGenerationError;
}

const HTTP_ERRORS: HttpErrorKind[] = [
  "invalid_key",
  "no_credit",
  "rate_limited",
  "overloaded",
  "unavailable",
];

describe.each(["anthropic", "openai", "gemini"] as const)("LlmClient contract: %s", (id) => {
  const harness = PROVIDER_HARNESSES[id];
  const respondWith = (response: () => Response) => vi.fn<typeof fetch>(async () => response());
  let consoleSpies: MockInstance[];

  beforeEach(() => {
    consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
  });

  afterEach(() => {
    // The key must never reach the console, whatever the scenario.
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(harness.apiKey);
          expect(JSON.stringify(arg) ?? "").not.toContain(harness.apiKey);
        }
      }
    }
  });

  async function expectFailure(response: () => Response, kind: ProviderErrorKind) {
    const error = await failureOf(
      harness.makeClient(respondWith(response)).generateStructured(request),
    );
    expect(error.message).toBe(mapProviderError(kind, harness.errorContext).message);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe(kind);
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(harness.apiKey);
    expect(String(error.stack)).not.toContain(harness.apiKey);
  }

  it("reports token usage through onUsage", async () => {
    const onUsage = vi.fn();
    await harness
      .makeClient(respondWith(() => harness.text(JSON.stringify({ answer: "hi" }))))
      .generateStructured(request, { onUsage });

    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage.mock.calls[0]![0]).toMatchObject({ inputTokens: 100, outputTokens: 50 });
  });

  it.each([
    ["refused", () => harness.refusal()],
    ["truncated", () => harness.truncated()],
    ["schema-invalid", () => harness.text(JSON.stringify({ answer: 42 }))],
  ])("still reports usage when the response is %s", async (_name, response) => {
    const onUsage = vi.fn();
    await failureOf(
      harness.makeClient(respondWith(response)).generateStructured(request, { onUsage }),
    );

    expect(onUsage).toHaveBeenCalledOnce();
  });

  it("doesn't report usage when no response arrives", async () => {
    const onUsage = vi.fn();
    await failureOf(
      harness
        .makeClient(respondWith(() => harness.httpError("unavailable")))
        .generateStructured(request, { onUsage }),
    );

    expect(onUsage).not.toHaveBeenCalled();
  });

  it.each(Object.keys(AI_SCHEMAS) as AiSchemaName[])(
    "sends the %s schema and parses a valid response",
    async (name) => {
      const fixture = SCHEMA_FIXTURES[name];
      const fetchMock = respondWith(() => harness.text(JSON.stringify(fixture)));

      await expect(
        harness.makeClient(fetchMock).generateStructured(requestFor(name)),
      ).resolves.toEqual(fixture);

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
      expect(harness.sentSchema(body)).toMatchObject({ type: "object" });
    },
  );

  it("maps non-JSON output to bad_output", async () => {
    await expectFailure(() => harness.text("not json"), "bad_output");
  });

  it("maps schema-invalid output to bad_output", async () => {
    await expectFailure(() => harness.text(JSON.stringify({ answer: 42 })), "bad_output");
  });

  it.each([
    ["an empty summary", "codeReview", { ...SCHEMA_FIXTURES.codeReview, summary: "" }],
    [
      "two keyTakeaways",
      "reading",
      { ...SCHEMA_FIXTURES.reading, keyTakeaways: ["One thread", "Microtasks first"] },
    ],
  ] as const)(
    "still enforces constraints removed from the JSON schema (%s)",
    async (_name, schemaName, output) => {
      const error = await failureOf(
        harness
          .makeClient(respondWith(() => harness.text(JSON.stringify(output))))
          .generateStructured(requestFor(schemaName)),
      );
      expect(error.message).toBe(mapProviderError("bad_output", harness.errorContext).message);
    },
  );

  it("maps a refusal to refused", async () => {
    await expectFailure(harness.refusal, "refused");
  });

  it("maps a truncated response to truncated", async () => {
    await expectFailure(harness.truncated, "truncated");
  });

  it.each(HTTP_ERRORS)("maps the %s HTTP error without leaking the key", async (kind) => {
    await expectFailure(() => harness.httpError(kind), kind);
  });

  it("maps a request that outlives the timeout to timeout", async () => {
    const error = await failureOf(harness.makeClient(hangingFetch, 50).generateStructured(request));

    expect(error.message).toBe(mapProviderError("timeout", harness.errorContext).message);
    expect((error as ProviderError).kind).toBe("timeout");
    expect(error.cause).toBeUndefined();
  });
});
