import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * One `no-restricted-imports` config per file: everywhere except a client file,
 * every provider SDK is banned; in a client file, every SDK but its own is.
 * (ESLint merges a rule's options per file by replacement, so each file gets
 * one complete list.)
 */
function providerSdkRules(clients) {
  const restriction = ({ file, sdk, name }) => ({
    group: [sdk, `${sdk}/*`],
    message: `Import ${name} only in ${file}.`,
  });
  const rule = (allowed) => ({
    "no-restricted-imports": [
      "error",
      { patterns: clients.filter((client) => client !== allowed).map(restriction) },
    ],
  });
  return [
    {
      files: ["**/*.{ts,tsx,mts,mjs,js}"],
      ignores: clients.map((client) => client.file),
      rules: rule(undefined),
    },
    ...clients.map((client) => ({ files: [client.file], rules: rule(client) })),
  ];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Provider SDKs are imported only by their client in src/server/ai/, and each
  // client file may import only its own SDK.
  ...providerSdkRules([
    {
      file: "src/server/ai/anthropic-api-client.ts",
      sdk: "@anthropic-ai/sdk",
      name: "the Anthropic SDK",
    },
    {
      file: "src/server/ai/claude-agent-client.ts",
      sdk: "@anthropic-ai/claude-agent-sdk",
      name: "the Agent SDK",
    },
    { file: "src/server/ai/openai-client.ts", sdk: "openai", name: "the OpenAI SDK" },
    { file: "src/server/ai/gemini-client.ts", sdk: "@google/genai", name: "the Google GenAI SDK" },
  ]),
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
