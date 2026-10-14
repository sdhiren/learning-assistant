/**
 * Tidies code written by Claude so it displays cleanly. Every change is
 * whitespace-only and safe for indentation-sensitive languages such as
 * Python: line endings, trailing spaces, blank edges, shared indentation,
 * and a Markdown fence the model sometimes wraps around the snippet.
 */
export function normalizeCode(code: string): string {
  const lines = stripFence(code.replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));

  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();

  const indents = lines.filter((line) => line !== "").map((line) => /^[ \t]*/.exec(line)![0]);
  const sharedIndent = indents.reduce(commonPrefix, indents[0] ?? "");

  return lines.map((line) => line.slice(sharedIndent.length)).join("\n");
}

const FENCE = /^\s*```[\w#+.-]*[ \t]*\n([\s\S]*?)\n[ \t]*```\s*$/;

function stripFence(code: string): string {
  return FENCE.exec(code)?.[1] ?? code;
}

function commonPrefix(a: string, b: string): string {
  let length = 0;
  while (length < a.length && a[length] === b[length]) length++;
  return a.slice(0, length);
}

export type InlineSegment = { kind: "text" | "code"; value: string };

/**
 * Splits prose into plain text and `inline code` spans, so identifiers in
 * prompts, options and explanations render as code instead of raw backticks.
 * An unmatched backtick stays as literal text.
 */
export function splitInlineCode(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "code", value: match[1]! });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ kind: "text", value: text.slice(lastIndex) });
  return segments;
}
