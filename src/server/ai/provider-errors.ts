import { AiGenerationError } from "@/lib/errors";

/** Provider-neutral failure categories, each with its own user-facing message. */
export type ProviderErrorKind =
  | "invalid_key"
  | "no_credit"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "refused"
  | "truncated"
  | "bad_output"
  | "unavailable";

export interface ProviderErrorContext {
  /** e.g. "Claude", "GPT". */
  providerLabel: string;
  /** e.g. "Anthropic"; used for the key and billing messages. */
  vendorName: string;
  /** e.g. "ANTHROPIC_API_KEY". */
  keyEnvVar: string;
}

/**
 * A friendly AiGenerationError for a provider failure. Deliberately has no
 * `cause`: SDK errors can carry request headers and response bodies.
 */
export function mapProviderError(
  kind: ProviderErrorKind,
  { providerLabel, vendorName, keyEnvVar }: ProviderErrorContext,
): AiGenerationError {
  const messages: Record<ProviderErrorKind, string> = {
    invalid_key: `Your ${vendorName} API key was rejected. Check ${keyEnvVar} in .env.local and restart the app.`,
    no_credit: `Your ${vendorName} API account is out of credit. Add credit in the ${vendorName} console, then try again.`,
    rate_limited: `${providerLabel} is rate-limiting requests. Wait a minute and try again.`,
    overloaded: `${providerLabel} is overloaded right now. Please try again in a few minutes.`,
    timeout: `${providerLabel} took too long to respond. Please try again.`,
    refused: `${providerLabel} declined this request. Try rephrasing your topic or instructions.`,
    truncated: `${providerLabel}'s response was cut off before it finished. Please try again.`,
    bad_output: `${providerLabel} returned an unexpected response. Please try again.`,
    unavailable: `${providerLabel} couldn't complete the request. Please try again in a moment.`,
  };
  return new AiGenerationError(messages[kind]);
}

/** Token shapes used by the supported providers' API keys. */
const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
];

/** Replaces each known secret, and anything shaped like an API key, with `[redacted]`. */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[] = []): string {
  let result = text;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[redacted]");
  }
  for (const pattern of KEY_PATTERNS) result = result.replace(pattern, "[redacted]");
  return result;
}

export interface SafeErrorContext {
  name: string;
  status?: number;
  type?: string;
  requestId?: string;
}

/**
 * The only error details that are safe to log: never the raw error object,
 * which may hold headers (including the key) or an echoed request body.
 */
export function safeErrorContext(error: unknown): SafeErrorContext {
  if (!(error instanceof Error)) return { name: typeof error };
  const fields = error as Error & { status?: unknown; type?: unknown; requestID?: unknown };
  return {
    name: error.name,
    status: typeof fields.status === "number" ? fields.status : undefined,
    type: typeof fields.type === "string" ? fields.type : undefined,
    requestId: typeof fields.requestID === "string" ? fields.requestID : undefined,
  };
}
