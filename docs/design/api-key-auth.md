# Design: Claude authentication with an API key (B14)

Status: **proposed** · Backlog: [B14](../BACKLOG.md#b14-claude-authentication-with-an-api-key--todo--m)

## Requirement

Besides the Claude subscription (the Claude Code login on this Mac), let the app use an
**Anthropic API key** for its Claude calls.

## Where this fits today

All Claude calls go through the `LlmClient` interface (`src/server/ai/llm-client.ts`), which has
a single method, `generateStructured(request)`. The only implementation is `ClaudeAgentClient`,
which uses the Claude Agent SDK (a Claude Code subprocess per call). Services never see which
provider is used, so this feature is a **new `LlmClient` implementation plus configuration**. No
service or prompt changes are needed.

## Options considered

|        | A. Pass the key to the Agent SDK              | **B. New client on the Anthropic API SDK (recommended)**                                   |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| How    | Set `ANTHROPIC_API_KEY` in the subprocess env | `AnthropicApiClient` using `@anthropic-ai/sdk` (`messages.parse` with a Zod output format) |
| Speed  | ~1 s subprocess start per call                | Direct HTTPS call, no subprocess                                                           |
| Errors | Generic subprocess failures                   | Typed errors: invalid key (401), rate limit (429), overloaded, low credit balance          |
| Extras | None                                          | Prompt caching, token usage and cost per request, refusal handling                         |
| Code   | Tiny                                          | One new class (~150 lines)                                                                 |

**Decision: B.** The Agent SDK is the right tool for the subscription; for an API key, the
official API SDK is simpler, faster and gives clear errors.

## Design

### `AnthropicApiClient implements LlmClient`

- **Model and output:** model from settings (default `claude-opus-5-5`). Adaptive thinking with
  `output_config.effort` mapped from the request's `effort`. Structured output via
  `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`, reusing the
  existing zod schemas, which are then validated again as today.
- **Long outputs:** use streaming with `finalMessage()` for lessons and quizzes, to avoid HTTP
  timeouts.
- **Stop reasons:** check `stop_reason` before reading output.
  - `max_tokens`: treat as a generation error.
  - `refusal`: show a clear "Claude declined this request" message.
- **Refusal fallback:** enable the API's server-side fallback (`fallbacks: "default"`), so a
  safety-classifier false positive is retried on another model instead of failing. This is the
  recommended default for Opus 5.5.
- **Prompt caching:** cache the stable system prompts; the persona and rules are identical across
  calls.
- **Error mapping:** map the SDK's typed errors to friendly `AiGenerationError` messages (invalid
  key, out of credit, rate limited, overloaded, timed out).
- **Logging:** log only the task, duration and token usage. Never the key, prompts or answers.

### Choosing the provider

`createLlmClient(settings)` in the composition root returns `ClaudeAgentClient` (mode
`subscription`) or `AnthropicApiClient` (mode `api_key`).

**Fix an existing trap:** today the subscription client passes the whole `process.env` to Claude
Code. So if `ANTHROPIC_API_KEY` happens to be set in the shell, "subscription" mode silently
bills the API key. In subscription mode, remove `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`
from the environment passed to the subprocess, so each mode means what it says.

### Where the key is configured

| Stage                       | Where the key lives                                                                | Notes                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **1. Env var (ship first)** | `ANTHROPIC_API_KEY` + `CLAUDE_AUTH_MODE=api_key` in `.env.local`                   | `.env.local` is already git-ignored. Validated by `env.ts`.                   |
| **2. Settings page**        | **macOS Keychain** (`security add-generic-password`, service `learning-assistant`) | Never in SQLite, never in a file in the repo, never sent back to the browser. |

Rules for the settings page (stage 2):

- **Write-only key field.** After saving, show only "Connected · key ending ••••Ab3d", with
  Replace and Remove buttons. The key is never returned to the browser.
- **Validate on save** with a cheap call (`models.retrieve`), mapping errors to "Invalid key" or
  "No credit".
- **Provider switch:** "Claude subscription" or "API key", plus model choice.
- **Profiles:** with profiles (B13), the provider and key are **per profile**. The Keychain
  account is the profile id, so two people each use their own key and bill.
- **Other platforms:** on Linux, fall back to the env var only. The design doesn't depend on
  macOS for stage 1.

### Cost visibility (recommended)

- API usage is billed per token. Record `usage` (input, output, cache read) per request and show
  "≈ $0.04 this quiz" plus a running monthly total on the settings page, from a price table.
- Optional **monthly budget**: refuse new generations past a limit the user sets.

## Security checklist

- The key is read and used only in `server-only` modules. It never reaches the client bundle or
  the browser.
- It's never stored in the database, never logged, never put in error messages, and redacted if
  it ever appears in an error string.
- The Keychain (stage 2) or a git-ignored `.env.local` (stage 1) holds it at rest.
- Calls go from the local server to `api.anthropic.com`, so the page's CSP is unaffected.
- The existing prompt-injection protections (tagged learner text, schema-validated output) apply
  unchanged.

## Testing

- **Unit tests** with the SDK's HTTP layer mocked:
  - Success and parse paths.
  - `max_tokens` and `refusal` stop reasons.
  - Each error type mapped to the right message.
  - The key never appearing in logs or errors.
- **Contract test:** the same `StructuredRequest` gives schema-valid output through both clients
  (run manually with real credentials: `make smoke-claude`).
- **Env test:** subscription mode strips `ANTHROPIC_API_KEY` from the subprocess env.

## Open questions

1. **Key scope:** one key for the whole app, or a key per profile? Recommended: per profile,
   which needs B13 first.
2. **Storage:** is the env var enough, or do you want the settings page with Keychain storage?
3. **Model with an API key:** keep `claude-opus-5-5` (best quality), or offer a cheaper model per
   profile? Your call; the default stays Opus 5.5.

## Plan

1. `AnthropicApiClient`, env-var configuration, and the subscription env fix. **M**
2. Settings page with Keychain storage, validation and the cost display. **M**, after B13 if keys
   are per profile.
