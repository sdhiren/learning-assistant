import { describe, expect, it } from "vitest";

import { AiGenerationError } from "@/lib/errors";

import { mapProviderError, redactSecrets, safeErrorContext } from "./provider-errors";

const context = { providerLabel: "GPT", vendorName: "OpenAI", keyEnvVar: "OPENAI_API_KEY" };

describe("mapProviderError", () => {
  it.each([
    ["invalid_key", "Your OpenAI API key was rejected. Check OPENAI_API_KEY in .env.local"],
    ["no_credit", "Your OpenAI API account is out of credit"],
    ["rate_limited", "GPT is rate-limiting requests"],
    ["overloaded", "GPT is overloaded right now"],
    ["timeout", "GPT took too long to respond"],
    ["refused", "GPT declined this request"],
    ["truncated", "GPT's response was cut off"],
    ["bad_output", "GPT returned an unexpected response"],
    ["unavailable", "GPT couldn't complete the request"],
  ] as const)("maps %s to provider-specific copy", (kind, message) => {
    const error = mapProviderError(kind, context);
    expect(error).toBeInstanceOf(AiGenerationError);
    expect(error.message).toContain(message);
    expect(error.cause).toBeUndefined();
  });
});

describe("redactSecrets", () => {
  it("removes known secrets and key-shaped tokens", () => {
    const text =
      "key=my-secret anthropic=sk-ant-api03-abc_DEF openai=sk-proj-abcdefghijklmnopqrst gemini=AIzaSyA1234567890abcdefghijk";
    expect(redactSecrets(text, ["my-secret"])).toBe(
      "key=[redacted] anthropic=[redacted] openai=[redacted] gemini=[redacted]",
    );
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecrets("rate limit exceeded", [undefined])).toBe("rate limit exceeded");
  });
});

describe("safeErrorContext", () => {
  it("keeps only name, status, type and request id", () => {
    const error = Object.assign(new Error("body with sk-ant-secret"), {
      status: 401,
      type: "authentication_error",
      requestID: "req_1",
      headers: { "x-api-key": "sk-ant-secret" },
    });
    expect(safeErrorContext(error)).toEqual({
      name: "Error",
      status: 401,
      type: "authentication_error",
      requestId: "req_1",
    });
  });
});
