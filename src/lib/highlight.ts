import type { Root } from "hast";
import { common, createLowlight } from "lowlight";

/**
 * Syntax highlighting for quiz code blocks. It uses the same grammars as
 * rehype-highlight in lessons (highlight.js "common": ~35 popular languages)
 * and the same `.hljs-*` colours from globals.css. Highlighting is
 * synchronous, so it also works inside client components.
 */
const lowlight = createLowlight(common);

/** Highlighted syntax tree, or null when the language is unknown or plain text. */
export function highlightCode(code: string, language: string | null | undefined): Root | null {
  if (!language || !lowlight.registered(language)) return null;
  return lowlight.highlight(language, code);
}

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  php: "PHP",
  python: "Python",
  py: "Python",
  ruby: "Ruby",
  rust: "Rust",
  sql: "SQL",
  swift: "Swift",
  ts: "TypeScript",
  typescript: "TypeScript",
  yaml: "YAML",
};

/** Human-friendly language name for a code block header, e.g. "csharp" -> "C#". */
export function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language.toLowerCase()] ?? language;
}
