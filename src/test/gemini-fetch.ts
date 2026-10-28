/**
 * Fake HTTP responses for the Gemini API `generateContent` endpoint, for
 * tests that inject `fetch` into GeminiClient.
 */

export interface FakeGeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}

/** A `generateContent` result whose single candidate's text is `text` (JSON for structured output). */
export function geminiResponse({
  json,
  text = JSON.stringify(json),
  finishReason = "STOP",
  blockReason,
  usage = {},
}: {
  json?: unknown;
  text?: string;
  finishReason?: string;
  blockReason?: string;
  usage?: FakeGeminiUsage;
}): Response {
  const body = blockReason
    ? { promptFeedback: { blockReason } }
    : {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "thinking about it", thought: true }, { text }],
            },
            finishReason,
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: usage.promptTokenCount ?? 100,
          candidatesTokenCount: usage.candidatesTokenCount ?? 50,
          thoughtsTokenCount: usage.thoughtsTokenCount ?? 0,
          cachedContentTokenCount: usage.cachedContentTokenCount ?? 0,
        },
        modelVersion: "gemini-2.5-pro",
      };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A JSON error response in the Google API error shape. */
export function geminiError(
  code: number,
  status: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message, status } }), {
    status: code,
    headers: { "content-type": "application/json", ...headers },
  });
}
