import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Provider SDKs are imported only by their client in src/server/ai/.
  {
    files: ["**/*.{ts,tsx,mts,mjs,js}"],
    ignores: ["src/server/ai/anthropic-api-client.ts", "src/server/ai/claude-agent-client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*"],
              message: "Import the Anthropic SDK only in src/server/ai/anthropic-api-client.ts.",
            },
            {
              group: ["@anthropic-ai/claude-agent-sdk", "@anthropic-ai/claude-agent-sdk/*"],
              message: "Import the Agent SDK only in src/server/ai/claude-agent-client.ts.",
            },
          ],
        },
      ],
    },
  },
  // User-facing copy names the active provider (useAiProvider / getAiProviderInfo), never "Claude".
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["JSXText", "Literal", "TemplateElement"].map((node) => ({
          selector:
            node === "TemplateElement"
              ? `TemplateElement[value.raw=/\\bClaude\\b/]`
              : `${node}[value=/\\bClaude\\b/]`,
          message:
            "Don't hard-code 'Claude' in UI copy; use the provider label from useAiProvider() or getAiProviderInfo().",
        })),
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
