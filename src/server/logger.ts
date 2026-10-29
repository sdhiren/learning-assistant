import "server-only";

import { redactSecrets } from "@/server/ai/provider-errors";
import { getRequestContext } from "@/server/request-context";

type LogContext = Record<string, unknown>;

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const SINKS: Record<LogLevel, (line: string) => void> = {
  debug: (line) => console.log(line),
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

let warnedInvalidLevel = false;

/**
 * The minimum level to write, from `LOG_LEVEL` (default `info`). Read from
 * `process.env` directly: `env.ts` imports this logger, so `getEnv()` would
 * be an import cycle. Read on every call so tests can stub it.
 */
function minimumLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (!raw) return "info";
  if ((LOG_LEVELS as readonly string[]).includes(raw)) return raw as LogLevel;
  if (!warnedInvalidLevel) {
    warnedInvalidLevel = true;
    write("warn", "Invalid LOG_LEVEL; using info", { allowed: LOG_LEVELS.join("|") });
  }
  return "info";
}

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) return { name: typeof error };
  return { name: error.name, message: error.message, stack: error.stack };
}

/** JSON.stringify that turns cycles into "[circular]" and errors into plain objects. */
function stringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, field: unknown) => {
    if (typeof field === "bigint") return field.toString();
    if (field instanceof Error) return serializeError(field);
    if (typeof field === "object" && field !== null) {
      if (seen.has(field)) return "[circular]";
      seen.add(field);
    }
    return field;
  });
}

function write(level: LogLevel, msg: string, context?: LogContext) {
  const request = getRequestContext();
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(request && { requestId: request.requestId, action: request.action }),
    ...context,
  };
  let line: string;
  try {
    line = stringify(entry);
  } catch {
    line = JSON.stringify({ ts: entry.ts, level, msg, serializationError: true });
  }
  // Defense in depth: nothing shaped like an API key reaches the console.
  SINKS[level](redactSecrets(line));
}

function log(level: LogLevel, msg: string, context?: LogContext) {
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(minimumLevel())) return;
  write(level, msg, context);
}

/**
 * Structured logger: one JSON line per event with `ts`, `level`, `msg`, the
 * current `requestId`/`action` (see `request-context.ts`) and the context.
 * Never log answers, prompts or other user content.
 */
export const logger = {
  debug(message: string, context?: LogContext) {
    log("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    log("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    log("warn", message, context);
  },
  error(message: string, error: unknown, context?: LogContext) {
    log("error", message, { ...context, error: serializeError(error) });
  },
};
