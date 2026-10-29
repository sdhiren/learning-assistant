import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
  /** Correlates every log line and `llm_calls` row of one server action. */
  requestId: string;
  /** The server action's name, e.g. "createTopic". */
  action: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with a fresh request id, visible to the logger and the AI call recorder. */
export function runWithRequestContext<T>(action: string, fn: () => T): T {
  return storage.run({ requestId: randomUUID(), action }, fn);
}

/** The current action's context, or undefined outside one (e.g. in scripts). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
