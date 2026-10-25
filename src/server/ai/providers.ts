/** The AI providers the app knows about. `claude-code` (the Claude subscription) is the default. */
export const PROVIDER_IDS = ["claude-code", "anthropic", "openai", "gemini"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderInfo {
  /** Short name used in user-facing copy, e.g. "Claude is writing your lesson". */
  label: string;
  defaultModel: string;
  /** Environment variable that holds the API key, or null when the provider needs none. */
  keyEnvVar: string | null;
  needsKey: boolean;
  /** False until the provider has an `LlmClient`; selecting it fails at startup. */
  implemented: boolean;
  /** Footer text describing how the app reaches the model. */
  usageNote: string;
}

/** Provider metadata. Pure data: no SDK imports, safe to read from anywhere on the server. */
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  "claude-code": {
    label: "Claude",
    defaultModel: "claude-opus-5-5",
    keyEnvVar: null,
    needsKey: false,
    implemented: true,
    usageNote: "Runs locally with your Claude subscription.",
  },
  anthropic: {
    label: "Claude",
    defaultModel: "claude-opus-5-5",
    keyEnvVar: "ANTHROPIC_API_KEY",
    needsKey: true,
    implemented: true,
    usageNote: "Runs locally with your Anthropic API key.",
  },
  openai: {
    label: "GPT",
    // Placeholder: the OpenAI client PR confirms the default model.
    defaultModel: "gpt-5",
    keyEnvVar: "OPENAI_API_KEY",
    needsKey: true,
    implemented: false,
    usageNote: "Runs locally with your OpenAI API key.",
  },
  gemini: {
    label: "Gemini",
    // Placeholder: the Gemini client PR confirms the default model.
    defaultModel: "gemini-2.5-pro",
    keyEnvVar: "GEMINI_API_KEY",
    needsKey: true,
    implemented: false,
    usageNote: "Runs locally with your Gemini API key.",
  },
};

/** Providers that accept the deprecated `CLAUDE_MODEL` variable as their model. */
export const CLAUDE_MODEL_PROVIDERS: readonly ProviderId[] = ["claude-code", "anthropic"];
