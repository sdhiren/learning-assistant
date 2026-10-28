/**
 * Fake HTTP responses for the OpenAI Responses API, for tests that inject
 * `fetch` into OpenAiClient.
 */

export interface FakeOpenAiUsage {
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
}

/** A non-streamed Responses API result whose message holds `text` (or a refusal). */
export function openAiResponse({
  json,
  text = JSON.stringify(json),
  refusal,
  status = "completed",
  incompleteReason,
  usage = {},
}: {
  json?: unknown;
  text?: string;
  refusal?: string;
  status?: "completed" | "incomplete";
  incompleteReason?: "max_output_tokens" | "content_filter";
  usage?: FakeOpenAiUsage;
}): Response {
  const content =
    refusal === undefined
      ? [{ type: "output_text", text, annotations: [] }]
      : [{ type: "refusal", refusal }];
  const body = {
    id: "resp_test",
    object: "response",
    created_at: 0,
    model: "gpt-5",
    status,
    incomplete_details: incompleteReason ? { reason: incompleteReason } : null,
    output: [
      { id: "rs_test", type: "reasoning", summary: [] },
      { id: "msg_test", type: "message", role: "assistant", status, content },
    ],
    usage: {
      input_tokens: usage.input_tokens ?? 100,
      input_tokens_details: { cached_tokens: usage.cached_tokens ?? 0 },
      output_tokens: usage.output_tokens ?? 50,
      output_tokens_details: { reasoning_tokens: usage.reasoning_tokens ?? 0 },
      total_tokens: (usage.input_tokens ?? 100) + (usage.output_tokens ?? 50),
    },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "req_test_ok" },
  });
}

/** A JSON error response in the API's error shape. */
export function openAiError(
  status: number,
  { type, code = null, message }: { type: string; code?: string | null; message: string },
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { type, code, message, param: null } }), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req_test_error", ...headers },
  });
}
