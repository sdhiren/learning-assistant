import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PROVIDER_SCHEMA_KEYWORDS, toProviderJsonSchema } from "./schema-adapter";
import { AI_SCHEMAS, generatedQuizSchema, readingSchema } from "./schemas";

type Node = Record<string, unknown>;

/** Every schema node in the tree (the root, properties, items, anyOf branches and $defs). */
function nodesOf(node: Node): Node[] {
  const children: Node[] = [];
  for (const key of ["properties", "$defs"]) {
    if (node[key]) children.push(...Object.values(node[key] as Record<string, Node>));
  }
  if (Array.isArray(node.items)) children.push(...(node.items as Node[]));
  else if (node.items) children.push(node.items as Node);
  if (node.anyOf) children.push(...(node.anyOf as Node[]));
  return [node, ...children.flatMap(nodesOf)];
}

const schemas = Object.entries(AI_SCHEMAS);

describe("toProviderJsonSchema", () => {
  it("covers all seven schemas", () => {
    expect(schemas).toHaveLength(7);
  });

  describe.each(["openai", "gemini"] as const)("%s", (provider) => {
    it.each(schemas)("converts %s within the provider's keyword allowlist", (name, schema) => {
      const output = toProviderJsonSchema(schema, provider);

      expect(output).toMatchSnapshot();
      for (const node of nodesOf(output)) {
        for (const keyword of Object.keys(node)) {
          expect(PROVIDER_SCHEMA_KEYWORDS[provider].has(keyword), `${name}: ${keyword}`).toBe(true);
        }
      }
    });

    it("drops the string length bounds and the safe-integer bounds zod adds for .int()", () => {
      const output = JSON.stringify(toProviderJsonSchema(generatedQuizSchema, provider));

      expect(output).not.toContain("minLength");
      expect(output).not.toContain(String(Number.MAX_SAFE_INTEGER));
      expect(output).toContain('"type":"integer"');
    });

    it("keeps descriptions, nullable branches and supported bounds", () => {
      const quiz = toProviderJsonSchema(generatedQuizSchema, provider) as {
        properties: { questions: { items: { properties: Record<string, Node> } } };
      };
      const question = quiz.properties.questions.items.properties;

      expect(question.code).toEqual({
        type: ["string", "null"],
        description: expect.stringContaining("starter code"),
      });
      expect(question.correctOptionIndex).toEqual({
        anyOf: [{ type: "integer" }, { type: "null" }],
        description: expect.any(String),
      });
      expect(toProviderJsonSchema(readingSchema, provider)).toMatchObject({
        properties: { keyTakeaways: { type: "array", minItems: 3, maxItems: 5 } },
      });
    });
  });

  it.each(schemas)(
    "makes every openai object strict with every property required (%s)",
    (_name, schema) => {
      for (const node of nodesOf(toProviderJsonSchema(schema, "openai"))) {
        if (node.type !== "object") continue;
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties as Node));
      }
    },
  );

  it("throws for an .optional() property under openai, naming the fix", () => {
    const schema = z.object({ inner: z.object({ note: z.string().optional() }) });

    expect(() => toProviderJsonSchema(schema, "openai")).toThrow(
      /\$\.inner\.note is optional\. Use \.nullable\(\)/,
    );
    expect(() => toProviderJsonSchema(schema, "gemini")).not.toThrow();
  });

  it("throws for a non-object root under openai", () => {
    expect(() => toProviderJsonSchema(z.array(z.string()), "openai")).toThrow(/object/);
  });

  it("passes the base schema through unchanged for claude-code, minus $schema", () => {
    const output = toProviderJsonSchema(readingSchema, "claude-code");

    expect(output).not.toHaveProperty("$schema");
    expect(output).toEqual(
      Object.fromEntries(
        Object.entries(z.toJSONSchema(readingSchema, { io: "output" })).filter(
          ([key]) => key !== "$schema",
        ),
      ),
    );
  });
});
