export interface OutlineHeading {
  id: string;
  title: string;
}

/** URL-safe id for a heading, e.g. "How it works, step by step" -> "how-it-works-step-by-step". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

/** Plain text of inline Markdown: drops emphasis and code markers, keeps link text. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/** The lesson's `## ` headings in order, ignoring any inside fenced code blocks. */
export function extractOutline(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const title = stripInlineMarkdown(match[1]!);
    headings.push({ id: slugify(title), title });
  }
  return headings;
}
