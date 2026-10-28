# Design: multiple AI providers, Anthropic API key first (B14)

Status: **stage 1 done** (Anthropic API key, then OpenAI and Gemini in LA-2) · Backlog:
[B14](../BACKLOG.md#b14-multiple-ai-providers-anthropic-api-key-first--in-progress--m)

## Requirement

Besides the Claude subscription (the Claude Code login on this Mac), let the app use an
**Anthropic API key** for its model calls, and make adding **OpenAI** and **Gemini** later a small,
contained change.

## Where this fits

All model calls go through the `LlmClient` interface (`src/server/ai/llm-client.ts`): one method,
`generateStructured(request)`, plus a `providerLabel` for user-facing copy. Services never see
which provider is used, so each provider is **a new `LlmClient` implementation plus
configuration**. No service or prompt changes are needed.

## Options considered (Anthropic API key)

|        | A. Pass the key to the Agent SDK              | **B. New client on the Anthropic API SDK (chosen)**                   |
| ------ | --------------------------------------------- | --------------------------------------------------------------------- |
| How    | Set `ANTHROPIC_API_KEY` in the subprocess env | `AnthropicApiClient` using `@anthropic-ai/sdk` with structured output |
| Speed  | ~1 s subprocess start per call                | Direct HTTPS call, no subprocess                                      |
| Errors | Generic subprocess failures                   | Typed errors: invalid key (401), rate limit (429), overloaded, credit |
| Extras | None                                          | Prompt caching, token usage per request, refusal handling             |
| Code   | Tiny                                          | One new class (~200 lines)                                            |

**Decision: B.** The Agent SDK is the right tool for the subscription; for an API key, the
official API SDK is simpler, faster and gives clear errors.

## Provider registry

`src/server/ai/providers.ts` is pure data, with no SDK imports:

| `ProviderId`            | Label  | Default model     | Key variable        | Client               |
| ----------------------- | ------ | ----------------- | ------------------- | -------------------- |
| `claude-code` (default) | Claude | `claude-opus-5-5` | none                | `ClaudeAgentClient`  |
| `anthropic`             | Claude | `claude-opus-5-5` | `ANTHROPIC_API_KEY` | `AnthropicApiClient` |
| `openai`                | GPT    | `gpt-5`           | `OPENAI_API_KEY`    | `OpenAiClient`       |
| `gemini`                | Gemini | `gemini-2.5-pro`  | `GEMINI_API_KEY`    | `GeminiClient`       |

Each entry also carries `needsKey`, `implemented` and a `usageNote` (the footer text). All four are
implemented; a future provider adds a client file, an entry here and a case in `createLlmClient`.

### Configuration (stage 1: env vars)

- `AI_PROVIDER` (default `claude-code`) and `AI_MODEL` (default: the provider's default model).
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`: required only for the matching provider.
- `CLAUDE_MODEL`: deprecated alias for `AI_MODEL`, honoured for `claude-code` and `anthropic` when
  `AI_MODEL` is unset. Logs one deprecation warning.
- `env.ts` validates at startup (called from `src/instrumentation.ts`): a provider that needs a key fails with "AI_PROVIDER=anthropic
  needs ANTHROPIC_API_KEY (set it in .env.local)"; an unimplemented provider (none today) fails with
  "AI_PROVIDER=<id> is not available yet". Validation errors print messages, never values.
- `createLlmClient(config)` in `container.ts` switches on the provider (exhaustive). The UI gets
  only `{ label, usageNote }` from `getAiProviderInfo()`, through the root layout and a client
  context; the key never leaves the server.

## `AnthropicApiClient`

- **Model and output:** model from config. Adaptive thinking with `output_config.effort` from the
  request's `effort`. Structured output with `output_config.format` built from
  `zodOutputFormat(schema)`'s JSON schema, then validated again with the zod schema.
- **Always streams** (`messages.stream(...).finalMessage()`), so lessons and quizzes never hit HTTP
  timeouts and there is one code path to test.
- **Stop reasons first:** `refusal` → "Claude declined this request"; `max_tokens` or
  `model_context_window_exceeded` → "response was cut off". The JSON is parsed only after this
  check (the SDK's own parse hook is not used, so a truncated answer isn't reported as bad JSON).
- **Refusal fallback — decided: not in stage 1.** In `@anthropic-ai/sdk` 0.131, `fallbacks` exists
  only on the beta Messages API. Stage 1 stays on the stable API and maps refusals to a clear
  message; adding `fallbacks: "default"` is a follow-up once it reaches the stable API (or if we
  choose to adopt the beta surface).
- **Prompt caching:** the system prompt is sent with `cache_control: { type: "ephemeral" }`.
  Prompts shorter than the model's minimum cacheable length are silently not cached; the logged
  `cacheRead` count shows whether it takes effect. No savings are claimed.
- **Timeouts and retries:** the SDK retries 429/529/timeouts twice; an `AbortController` deadline
  caps the whole request (retries included) at `AI_TIMEOUT_MS`.
- **Logging:** one line per request with provider, task, model, duration, stop reason and token
  usage (input, output, cache read, cache write). Never prompts, outputs or the key.

### Shared error mapping (`provider-errors.ts`)

`mapProviderError(kind, { providerLabel, vendorName, keyEnvVar })` returns a friendly
`AiGenerationError` with no `cause` (SDK errors can carry headers and bodies):

| Kind           | Trigger (Anthropic)                                   | Message (abridged)                                       |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `invalid_key`  | 401, 403                                              | "Your Anthropic API key was rejected. Check ANTHROPIC_…" |
| `no_credit`    | `billing_error`, or a 400 mentioning "credit balance" | "Your Anthropic API account is out of credit…"           |
| `rate_limited` | 429                                                   | "Claude is rate-limiting requests…"                      |
| `overloaded`   | 529 / `overloaded_error`                              | "Claude is overloaded right now…"                        |
| `timeout`      | SDK timeout or the overall deadline                   | "Claude took too long to respond…"                       |
| `refused`      | `stop_reason: refusal`                                | "Claude declined this request…"                          |
| `truncated`    | `stop_reason: max_tokens`                             | "Claude's response was cut off…"                         |
| `bad_output`   | invalid JSON or schema mismatch                       | "Claude returned an unexpected response…"                |
| `unavailable`  | anything else                                         | "Claude couldn't complete the request…"                  |

`redactSecrets(text, secrets)` removes known keys and any `sk-ant-…`, `sk-…` or `AIza…` token;
`safeErrorContext(error)` keeps only `{ name, status, type, requestId }` for logs.

## Schema adapter (`schema-adapter.ts`)

`toProviderJsonSchema(schema, provider)` starts from `z.toJSONSchema(schema, { io: "output" })`
(minus `$schema`) and walks the tree (`properties`, `items`, `anyOf`, `$defs`). It keeps only the
keywords on each provider's **allowlist** (`PROVIDER_SCHEMA_KEYWORDS`), so a new zod feature
can't leak an unsupported keyword silently:

| Provider      | Kept                                                                                                                            | Removed (zod still enforces them afterwards)                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `claude-code` | everything (base schema only)                                                                                                   | `$schema`                                                          |
| `openai`      | `type properties required additionalProperties items enum anyOf description const $defs $ref minimum maximum minItems maxItems` | `minLength`, `maxLength`, `pattern`, `format`, safe-integer bounds |
| `gemini`      | the same without `const`                                                                                                        | as above, plus `const`                                             |

For OpenAI strict mode, every object also gets `additionalProperties: false` and a `required`
list naming every property. An `.optional()` property throws a developer error naming its path
(use `.nullable()`), and the root must be an object. Nullables stay as zod emits them
(`type: [X, "null"]` or `anyOf`), which both providers accept. `AnthropicApiClient` keeps the SDK's
`zodOutputFormat`. `AI_SCHEMAS` in `schemas.ts` lists all seven schemas for tests and the smoke
script.

## `OpenAiClient`

- **Request:** `responses.create` (non-streaming) with `instructions` (the system prompt),
  `input`, `store: false`, `max_output_tokens: 64000` (reasoning tokens count against it) and
  `text.format = { type: "json_schema", name: <task>, schema, strict: true }`.
- **Effort:** `low/medium/high` map 1:1 to `reasoning.effort`. `gpt-5` is a reasoning model, so
  there is no capability check: an `AI_MODEL` override **must be a reasoning model** (gpt-5
  family or o-series), or OpenAI rejects the request with a 400.
- **Checked before parsing:** a `refusal` content item → `refused`; `status: incomplete` with
  `content_filter` → `refused`, any other incomplete reason → `truncated`.
- **Logging:** input, output, cached (`cacheRead`) and reasoning tokens.

## `GeminiClient`

- **Request:** `models.generateContent` with `systemInstruction`,
  `responseMimeType: "application/json"`, `responseJsonSchema`, `maxOutputTokens: 65536` (the 2.5
  Pro maximum; thinking tokens count against it) and the deadline's `abortSignal`. The key travels
  in the `x-goog-api-key` header. The SDK retries 408, 429 and 5xx (`retryOptions.attempts: 3`).
- **Effort → `thinkingConfig.thinkingBudget`:** low 2048, medium 8192, high 24576. Fixed values
  rather than `-1` (dynamic) keep the output ceiling predictable; 2.5 Pro can't turn thinking off.
  Gemini 3 models still accept `thinkingBudget`.
- **Checked before parsing:** `promptFeedback.blockReason`, or `finishReason` SAFETY, RECITATION,
  PROHIBITED_CONTENT, BLOCKLIST or SPII → `refused`; `MAX_TOKENS` → `truncated`. Thought parts are
  ignored.
- **Logging:** prompt, candidates, cached and thoughts token counts.

### Error triggers per provider

| Kind           | Anthropic                             | OpenAI                              | Gemini                                     |
| -------------- | ------------------------------------- | ----------------------------------- | ------------------------------------------ |
| `invalid_key`  | 401, 403                              | 401, 403                            | 401, 403, or a 400 "API key not valid"     |
| `no_credit`    | `billing_error`, 400 "credit balance" | 429 with `code: insufficient_quota` | 429 whose message mentions billing/prepaid |
| `rate_limited` | 429                                   | any other 429                       | any other 429                              |
| `overloaded`   | 529 / `overloaded_error`              | 503                                 | 503                                        |
| `timeout`      | SDK timeout or the deadline           | SDK timeout or the deadline         | abort or the deadline                      |
| `unavailable`  | anything else                         | anything else                       | anything else                              |

Error contexts: OpenAI is "GPT" / "OpenAI" / `OPENAI_API_KEY`; Gemini is "Gemini" / "Google AI
Studio" / `GEMINI_API_KEY`.

## The subscription billing trap (fixed)

The subscription client used to pass the whole `process.env` to Claude Code, so a stray
`ANTHROPIC_API_KEY` in the shell silently billed that key. `buildAgentEnv()` now removes
`ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the subprocess env, so each mode means what it
says. Users who relied on the old behaviour should set `AI_PROVIDER=anthropic`.

## Provider-neutral copy

User-facing strings in `src/app` and `src/components` (progress messages, footer, home page,
instructions field, review messages, metadata) use the provider label and usage note; service
errors use `llm.providerLabel`. An ESLint `no-restricted-syntax` rule fails `npm run check` if a
literal "Claude" string returns there. A second rule keeps each provider SDK inside its client
file under `src/server/ai/`, and each client file may import only its own SDK.

## Stage 2: settings page (unchanged plan)

| Stage                    | Where the key lives                                                                | Notes                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **1. Env var (this PR)** | `AI_PROVIDER` + the provider's key in `.env.local`                                 | `.env.local` is already git-ignored. Validated by `env.ts`.                   |
| **2. Settings page**     | **macOS Keychain** (`security add-generic-password`, service `learning-assistant`) | Never in SQLite, never in a file in the repo, never sent back to the browser. |

Rules for the settings page:

- **Write-only key field.** After saving, show only "Connected · key ending ••••Ab3d", with
  Replace and Remove buttons. The key is never returned to the browser.
- **Validate on save** with a cheap call (e.g. `models.retrieve`), mapping errors through
  `mapProviderError`.
- **Provider switch** across the registry's implemented providers, plus model choice.
- **Profiles:** with profiles (B13), the provider and key are **per profile**. The Keychain
  account is the profile id, so two people each use their own key and bill.
- **Other platforms:** on Linux, fall back to the env var only.

### Cost visibility (recommended for stage 2)

- API usage is billed per token. Stage 1 already logs `usage` per request; stage 2 can record it
  and show "≈ $0.04 this quiz" plus a monthly total, from a price table.
- Optional **monthly budget**: refuse new generations past a limit the user sets.

## Security checklist

- Keys are read and used only in `server-only` modules. They never reach the client bundle, props
  or context; only `label` and `usageNote` cross into client components.
- Never stored in the database, never logged, never put in error messages or causes, and redacted
  if they ever appear in a logged error field. A unit test echoes the key in error bodies and
  asserts it never reaches the console or the thrown error.
- Calls go from the local server to `api.anthropic.com`, so the page's CSP is unaffected.
- The existing prompt-injection protections (tagged learner text, schema-validated output) apply
  unchanged.

## Testing

- `llm-client.contract.test.ts`: `describe.each` over `anthropic`, `openai` and `gemini` with
  fake HTTP transports (`src/test/provider-harness.ts`). Every schema in `AI_SCHEMAS` round-trips.
  Non-JSON and schema-invalid output (including constraints the adapter removed), refusal,
  truncation, invalid key, no credit, 429, overloaded, 5xx and timeout each throw exactly
  `mapProviderError(kind, ctx).message` with no `cause`. The key, echoed in error bodies and
  headers, never reaches the error or the console.
- `schema-adapter.test.ts`: snapshots, allowlists, strict-mode objects, the `.optional()` throw.
- `anthropic-api-client.test.ts`, `openai-client.test.ts`, `gemini-client.test.ts`: request
  shape, effort mapping, output caps, usage logging and provider-specific errors.
- `claude-agent-client.test.ts`: the `env` passed to `query()` has no `ANTHROPIC_API_KEY` or
  `ANTHROPIC_AUTH_TOKEN` but keeps `PATH` and `CLAUDE_AGENT_SDK_CLIENT_APP`.
- `env.test.ts`, `provider-errors.test.ts`, `container.test.ts`, and a service test for the
  provider label in error copy.
- **Manual contract check** with a real key: `make smoke-provider PROVIDER=<id> TASKS=all` runs
  every task (skill tree, subtopic, quiz with `toQuestionDraft`, reading, short-answer,
  code-output and coding-challenge grading) and prints pass or fail for each.

## Open questions

1. **Key scope:** one key for the whole app, or a key per profile? Recommended: per profile,
   which needs B13 first.
2. ~~**Storage:** env var or settings page?~~ Resolved: env var first (stage 1); the settings page
   with Keychain storage stays stage 2.
3. **Model with an API key:** keep `claude-opus-5-5` (best quality), or offer a cheaper model?
   `AI_MODEL` already allows any model; the default stays Opus 5.5.

## Plan

1. Provider registry, `AnthropicApiClient`, env-var configuration, shared error mapping, the
   subscription env fix, provider-neutral copy. **M** (this PR)
2. `OpenAiClient` and `GeminiClient`, the schema adapter, the contract suite and the smoke
   script. **M** (done in LA-2, one PR by the owner's decision)
3. Settings page with Keychain storage, validation and the cost display. **M**, after B13 if keys
   are per profile.
