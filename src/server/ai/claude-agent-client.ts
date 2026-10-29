import "server-only";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  query,
  type SDKAssistantMessageError,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { AiGenerationError } from "@/lib/errors";
import { logger } from "@/server/logger";

import type { GenerationHooks, LlmClient, LlmUsage, StructuredRequest } from "./llm-client";
import { ProviderError, type ProviderErrorKind } from "./provider-errors";
import { toProviderJsonSchema } from "./schema-adapter";

interface ClaudeAgentClientOptions {
  model: string;
  timeoutMs: number;
}

const CLIENT_APP_ID = "learning-assistant/0.1.0";

const UNAVAILABLE_MESSAGE =
  "Claude couldn't complete the request. Check that you're logged in to Claude Code " +
  "(run `claude` in a terminal) and that you haven't reached your usage limit, then try again.";

/**
 * Calls Claude through the Claude Agent SDK, which authenticates with the
 * Claude Code login on this machine (the user's Claude subscription). API
 * credentials are stripped from the subprocess env (see `buildAgentEnv`).
 *
 * The agent is locked down to pure text generation: no built-in tools, no MCP
 * servers, no filesystem settings or CLAUDE.md files, no persisted sessions,
 * and an empty scratch working directory. Prompt-injected text therefore has
 * nothing to act on beyond producing (validated) output.
 */
export class ClaudeAgentClient implements LlmClient {
  readonly providerLabel = "Claude";
  private sandboxDir: string | undefined;

  constructor(private readonly options: ClaudeAgentClientOptions) {}

  async generateStructured<T>(request: StructuredRequest<T>, hooks?: GenerationHooks): Promise<T> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const outcome = await this.runQuery(request, abortController);
      if (outcome.result) hooks?.onUsage?.(toUsage(outcome.result));
      return this.parseResult(request, outcome);
    } catch (error) {
      if (error instanceof AiGenerationError) throw error;
      if (abortController.signal.aborted) {
        logger.warn("Claude request timed out", { task: request.task });
        throw claudeError("timeout");
      }
      logger.error("Claude request failed", error, { task: request.task });
      throw claudeError("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async runQuery<T>(
    request: StructuredRequest<T>,
    abortController: AbortController,
  ): Promise<QueryOutcome> {
    const conversation = query({
      prompt: request.prompt,
      options: {
        model: this.options.model,
        systemPrompt: request.systemPrompt,
        effort: request.effort,
        outputFormat: {
          type: "json_schema",
          schema: toProviderJsonSchema(request.schema, "claude-code"),
        },
        tools: [],
        mcpServers: {},
        strictMcpConfig: true,
        settingSources: [],
        permissionMode: "dontAsk",
        persistSession: false,
        maxTurns: 3,
        cwd: this.getSandboxDir(),
        abortController,
        env: buildAgentEnv(),
      },
    });

    const outcome: QueryOutcome = {};
    for await (const message of conversation) {
      if (message.type === "result") outcome.result = message;
      if (message.type === "assistant" && message.error) outcome.assistantError = message.error;
    }
    return outcome;
  }

  private parseResult<T>(
    request: StructuredRequest<T>,
    { result, assistantError }: QueryOutcome,
  ): T {
    if (!result || result.subtype !== "success" || result.is_error) {
      const kind = classifyFailure(result, assistantError);
      logger.warn("Claude returned no usable result", {
        task: request.task,
        kind,
        subtype: result?.subtype,
        assistantError,
      });
      throw claudeError(kind);
    }

    const parsed = request.schema.safeParse(result.structured_output);
    if (!parsed.success) {
      logger.warn("Claude output failed validation", {
        task: request.task,
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
      });
      throw claudeError("bad_output");
    }
    return parsed.data;
  }

  /** An empty directory so the agent never runs against the project folder. */
  private getSandboxDir(): string {
    this.sandboxDir ??= mkdtempSync(path.join(tmpdir(), "learning-assistant-agent-"));
    return this.sandboxDir;
  }
}

interface QueryOutcome {
  result?: SDKResultMessage;
  /** The last error an assistant message reported (auth, rate limit, ...). */
  assistantError?: SDKAssistantMessageError;
}

const ASSISTANT_ERROR_KINDS: Partial<Record<SDKAssistantMessageError, ProviderErrorKind>> = {
  authentication_failed: "invalid_key",
  oauth_org_not_allowed: "invalid_key",
  account_on_hold: "invalid_key",
  billing_error: "invalid_key",
  rate_limit: "rate_limited",
  overloaded: "overloaded",
  max_output_tokens: "truncated",
};

/** The failure kind for a result that isn't a usable success. */
export function classifyFailure(
  result: SDKResultMessage | undefined,
  assistantError: SDKAssistantMessageError | undefined,
): ProviderErrorKind {
  const fromAssistant = assistantError && ASSISTANT_ERROR_KINDS[assistantError];
  if (fromAssistant) return fromAssistant;
  if (result?.subtype === "error_max_structured_output_retries") return "bad_output";
  return "unavailable";
}

const MESSAGES: Record<ProviderErrorKind, string> = {
  invalid_key: UNAVAILABLE_MESSAGE,
  no_credit: UNAVAILABLE_MESSAGE,
  rate_limited: "Claude is rate-limiting requests. Wait a minute and try again.",
  overloaded: "Claude is overloaded right now. Please try again in a few minutes.",
  timeout: "Claude took too long to respond. Please try again.",
  refused: "Claude declined this request. Try rephrasing your topic or instructions.",
  truncated: "Claude's response was cut off before it finished. Please try again.",
  bad_output: "Claude returned an unexpected response. Please try again.",
  unavailable: UNAVAILABLE_MESSAGE,
};

/** A ProviderError with the subscription's own messages (login hint instead of key hints). */
function claudeError(kind: ProviderErrorKind): ProviderError {
  return new ProviderError(kind, MESSAGES[kind]);
}

/** The SDK reports usage and an (unbilled, API-equivalent) cost even on error results. */
function toUsage(result: SDKResultMessage): LlmUsage {
  return {
    inputTokens: result.usage?.input_tokens ?? null,
    outputTokens: result.usage?.output_tokens ?? null,
    cacheReadTokens: result.usage?.cache_read_input_tokens ?? null,
    cacheWriteTokens: result.usage?.cache_creation_input_tokens ?? null,
    apiDurationMs: result.duration_api_ms ?? null,
    costUsd: result.total_cost_usd ?? null,
  };
}

/**
 * The environment for the Claude Code subprocess. API credentials are removed
 * so a stray ANTHROPIC_API_KEY in the shell can't silently switch the
 * subscription path to API billing.
 */
export function buildAgentEnv(
  source: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...source,
    CLAUDE_AGENT_SDK_CLIENT_APP: CLIENT_APP_ID,
  };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}
