/**
 * Fake HTTP responses for the Anthropic Messages API, for tests that inject
 * `fetch` into AnthropicApiClient.
 */

export interface FakeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** A streamed (SSE) message whose single text block is `text` (JSON for structured output). */
export function sseMessage({
  json,
  text = JSON.stringify(json),
  stopReason = "end_turn",
  usage = {},
}: {
  json?: unknown;
  text?: string;
  stopReason?: string;
  usage?: FakeUsage;
}): Response {
  const events: [string, unknown][] = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage.input_tokens ?? 100,
            output_tokens: 1,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          },
        },
      },
    ],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: usage.output_tokens ?? 50 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  const body = events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", "request-id": "req_test_ok" },
  });
}

/** A JSON error response in the API's error shape. */
export function apiError(
  status: number,
  type: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_test_error", ...headers },
  });
}

/** A fetch that never answers until its signal aborts, for timeout tests. */
export const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
