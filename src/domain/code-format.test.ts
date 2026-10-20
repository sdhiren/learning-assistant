import { describe, expect, it } from "vitest";

import { detectIndent, normalizeCode, splitInlineCode } from "./code-format";

describe("detectIndent", () => {
  it("uses tabs when the code is tab-indented, as Go is", () => {
    expect(detectIndent("func f() {\n\treturn\n}")).toBe("\t");
  });

  it("matches the code's space width", () => {
    expect(detectIndent("def f():\n    return 1")).toBe("    ");
    expect(detectIndent("function f() {\n  return 1;\n}")).toBe("  ");
  });

  it("defaults to two spaces for unindented code", () => {
    expect(detectIndent("const x = 1;")).toBe("  ");
  });
});

describe("normalizeCode", () => {
  it("trims blank edges, trailing spaces and Windows line endings", () => {
    expect(normalizeCode("\r\n\r\nconst a = 1;   \r\nconsole.log(a);\t\r\n\n")).toBe(
      "const a = 1;\nconsole.log(a);",
    );
  });

  it("removes indentation shared by every line but keeps relative nesting", () => {
    expect(normalizeCode("    def f():\n        return 1\n\n    print(f())")).toBe(
      "def f():\n    return 1\n\nprint(f())",
    );
  });

  it("keeps tab indentation intact", () => {
    expect(normalizeCode("func main() {\n\tfmt.Println(1)\n}")).toBe(
      "func main() {\n\tfmt.Println(1)\n}",
    );
  });

  it("unwraps a Markdown fence around the whole snippet", () => {
    expect(normalizeCode("```python\nprint('hi')\n```")).toBe("print('hi')");
    expect(normalizeCode("```\nx = 1\n```\n")).toBe("x = 1");
  });

  it("leaves fences inside the code alone", () => {
    const code = 'const md = "```js\\nx\\n```";';
    expect(normalizeCode(code)).toBe(code);
  });
});

describe("splitInlineCode", () => {
  it("separates backtick spans from surrounding text", () => {
    expect(splitInlineCode("Use `async Task` instead of `async void`.")).toEqual([
      { kind: "text", value: "Use " },
      { kind: "code", value: "async Task" },
      { kind: "text", value: " instead of " },
      { kind: "code", value: "async void" },
      { kind: "text", value: "." },
    ]);
  });

  it("returns plain text unchanged, including stray backticks", () => {
    expect(splitInlineCode("no code here")).toEqual([{ kind: "text", value: "no code here" }]);
    expect(splitInlineCode("a ` b")).toEqual([{ kind: "text", value: "a ` b" }]);
  });
});
