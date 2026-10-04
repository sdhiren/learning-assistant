import "server-only";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { AiGenerationError } from "@/lib/errors";
import { logger } from "@/server/logger";

import type { LlmClient, StructuredRequest } from "./llm-client";

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
 * Claude Code login on this machine (the user's Claude subscription).
 *
 * The agent is locked down to pure text generation: no built-in tools, no MCP
 * servers, no filesystem settings or CLAUDE.md files, no persisted sessions,
 * and an empty scratch working directory. Prompt-injected text therefore has
 * nothing to act on beyond producing (validated) output.
 */
export class ClaudeAgentClient implements LlmClient {
  private sandboxDir: string | undefined;

  constructor(private readonly options: ClaudeAgentClientOptions) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);
    const startedAt = Date.now();

    try {
      const result = await this.runQuery(request, abortController);
      return this.parseResult(request, result);
    } catch (error) {
      if (error instanceof AiGenerationError) throw error;
      if (abortController.signal.aborted) {
        logger.warn("Claude request timed out", { task: request.task });
        throw new AiGenerationError("Claude took too long to respond. Please try again.");
      }
      logger.error("Claude request failed", error, { task: request.task });
      throw new AiGenerationError(UNAVAILABLE_MESSAGE, { cause: error });
    } finally {
      clearTimeout(timeout);
      logger.info("Claude request ended", {
        task: request.task,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async runQuery<T>(
    request: StructuredRequest<T>,
    abortController: AbortController,
  ): Promise<SDKResultMessage | undefined> {
    const conversation = query({
      prompt: request.prompt,
      options: {
        model: this.options.model,
        systemPrompt: request.systemPrompt,
        effort: request.effort,
        outputFormat: { type: "json_schema", schema: toJsonSchema(request.schema) },
        tools: [],
        mcpServers: {},
        strictMcpConfig: true,
        settingSources: [],
        permissionMode: "dontAsk",
        persistSession: false,
        maxTurns: 3,
        cwd: this.getSandboxDir(),
        abortController,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: CLIENT_APP_ID },
      },
    });

    let result: SDKResultMessage | undefined;
    for await (const message of conversation) {
      if (message.type === "result") result = message;
    }
    return result;
  }

  private parseResult<T>(request: StructuredRequest<T>, result: SDKResultMessage | undefined): T {
    if (!result || result.subtype !== "success" || result.is_error) {
      logger.warn("Claude returned no usable result", {
        task: request.task,
        subtype: result?.subtype,
        errors: result && result.subtype !== "success" ? result.errors : undefined,
      });
      throw new AiGenerationError(UNAVAILABLE_MESSAGE);
    }

    const parsed = request.schema.safeParse(result.structured_output);
    if (!parsed.success) {
      logger.warn("Claude output failed validation", {
        task: request.task,
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
      });
      throw new AiGenerationError("Claude returned an unexpected response. Please try again.");
    }
    return parsed.data;
  }

  /** An empty directory so the agent never runs against the project folder. */
  private getSandboxDir(): string {
    this.sandboxDir ??= mkdtempSync(path.join(tmpdir(), "learning-assistant-agent-"));
    return this.sandboxDir;
  }
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = z.toJSONSchema(schema, { io: "output" });
  delete jsonSchema.$schema;
  return jsonSchema;
}
