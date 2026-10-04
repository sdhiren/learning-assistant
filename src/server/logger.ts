import "server-only";

type LogContext = Record<string, unknown>;

/** Minimal structured logger. Never log answers, prompts or other user content. */
export const logger = {
  info(message: string, context?: LogContext) {
    console.info(`[learning-assistant] ${message}`, context ?? "");
  },
  warn(message: string, context?: LogContext) {
    console.warn(`[learning-assistant] ${message}`, context ?? "");
  },
  error(message: string, error: unknown, context?: LogContext) {
    console.error(`[learning-assistant] ${message}`, context ?? "", error);
  },
};
