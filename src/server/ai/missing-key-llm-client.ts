import type { LlmClient } from "./llm-client";
import { ProviderError } from "./provider-errors";
import { PROVIDERS, type ProviderId } from "./providers";

export function missingKeyMessage(provider: ProviderId): string {
  return `Add your ${PROVIDERS[provider].displayName} key in Profile → AI settings.`;
}

/**
 * Stands in for an API-key provider that has no key (neither saved on the
 * profile nor in the env), so the app still starts and the first AI call
 * says what to do instead of failing silently. Recorded as an `auth` outcome.
 */
export class MissingKeyLlmClient implements LlmClient {
  readonly providerLabel: string;

  constructor(private readonly provider: ProviderId) {
    this.providerLabel = PROVIDERS[provider].label;
  }

  generateStructured<T>(): Promise<T> {
    return Promise.reject(new ProviderError("invalid_key", missingKeyMessage(this.provider)));
  }
}
