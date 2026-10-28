import { z } from "zod";

/** Providers whose schema dialect the adapter knows. Anthropic uses the SDK's `zodOutputFormat`. */
export type SchemaProvider = "claude-code" | "openai" | "gemini";

type JsonSchema = Record<string, unknown>;

const COMMON_KEYWORDS = [
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "anyOf",
  "description",
  "$defs",
  "$ref",
];

/**
 * JSON Schema keywords each provider accepts in structured output. Everything
 * else is removed; the zod re-validation after each call still enforces the
 * dropped constraints (e.g. `minLength`).
 *
 * - OpenAI strict mode: https://platform.openai.com/docs/guides/structured-outputs
 *   (string length bounds are not supported).
 * - Gemini `responseJsonSchema`: https://ai.google.dev/gemini-api/docs/structured-output
 *   (no string length bounds, no `const`).
 */
export const PROVIDER_SCHEMA_KEYWORDS: Record<"openai" | "gemini", ReadonlySet<string>> = {
  openai: new Set([...COMMON_KEYWORDS, "const", "minimum", "maximum", "minItems", "maxItems"]),
  gemini: new Set([...COMMON_KEYWORDS, "minimum", "maximum", "minItems", "maxItems"]),
};

/**
 * The JSON Schema to send to `provider` for a zod schema. Throws a developer
 * error (not an AiGenerationError) if the schema can't be expressed for that
 * provider, e.g. an `.optional()` property under OpenAI strict mode.
 */
export function toProviderJsonSchema(schema: z.ZodType, provider: SchemaProvider): JsonSchema {
  const base: JsonSchema = z.toJSONSchema(schema, { io: "output" });
  delete base.$schema;
  if (provider === "claude-code") return base;

  if (provider === "openai" && base.type !== "object") {
    throw new Error("OpenAI structured output needs an object at the schema root.");
  }
  return adaptNode(base, provider, "$");
}

function adaptNode(node: JsonSchema, provider: "openai" | "gemini", path: string): JsonSchema {
  const allowed = PROVIDER_SCHEMA_KEYWORDS[provider];
  const result: JsonSchema = {};

  for (const [keyword, value] of Object.entries(node)) {
    if (!allowed.has(keyword)) continue;
    if ((keyword === "minimum" || keyword === "maximum") && isSafeIntegerBound(value)) continue;

    switch (keyword) {
      case "properties":
      case "$defs":
        result[keyword] = mapValues(value as Record<string, JsonSchema>, (child, key) =>
          adaptNode(child, provider, `${path}.${key}`),
        );
        break;
      case "items":
        result.items = Array.isArray(value)
          ? value.map((child: JsonSchema, i) => adaptNode(child, provider, `${path}[${i}]`))
          : adaptNode(value as JsonSchema, provider, `${path}[]`);
        break;
      case "anyOf":
        result.anyOf = (value as JsonSchema[]).map((child) => adaptNode(child, provider, path));
        break;
      default:
        result[keyword] = value;
    }
  }

  if (provider === "openai" && isObjectNode(node)) {
    const keys = Object.keys((node.properties as JsonSchema | undefined) ?? {});
    const required = new Set((node.required as string[] | undefined) ?? []);
    const optional = keys.filter((key) => !required.has(key));
    if (optional.length > 0) {
      throw new Error(
        `OpenAI strict mode needs every property to be required, but ${optional
          .map((key) => `${path}.${key}`)
          .join(", ")} is optional. Use .nullable() instead of .optional().`,
      );
    }
    result.properties ??= {};
    result.required = keys;
    result.additionalProperties = false;
  }

  return result;
}

function isObjectNode(node: JsonSchema): boolean {
  return node.type === "object" || (node.properties !== undefined && node.type === undefined);
}

/** The ±2^53-1 bounds zod adds for `.int()`; they carry no meaning for the model. */
function isSafeIntegerBound(value: unknown): boolean {
  return value === Number.MAX_SAFE_INTEGER || value === Number.MIN_SAFE_INTEGER;
}

function mapValues<T, R>(
  record: Record<string, T>,
  fn: (value: T, key: string) => R,
): Record<string, R> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value, key)]));
}
