import { CORRECT_SCORE_THRESHOLD } from "./question";

export interface GradeResult {
  /** 0 to 1. */
  score: number;
  isCorrect: boolean;
  feedback: string;
}

export function gradeMultipleChoice(selectedIndex: number, correctIndex: number): GradeResult {
  const isCorrect = selectedIndex === correctIndex;
  // The UI already marks the chosen and correct options, so no extra text is needed.
  return { score: isCorrect ? 1 : 0, isCorrect, feedback: "" };
}

/**
 * Normalises program output for comparison: unifies line endings, trims
 * trailing whitespace on each line and surrounding blank lines. Interior
 * whitespace is preserved because it is usually meaningful in output.
 */
export function normalizeOutput(output: string): string {
  return output
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** Lenient comparison: also ignores quote style and repeated spaces. */
function looseOutput(output: string): string {
  return normalizeOutput(output)
    .replace(/["'`]/g, "")
    .replace(/[ \t]+/g, " ")
    .toLowerCase();
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/**
 * A word counts as a typo of another only if both are purely alphabetic and
 * long enough that a slip can't turn one value into another (true/false,
 * nil/nul). Numbers and symbols must always match exactly.
 */
function isWordTypo(answer: string, expected: string): boolean {
  if (!/^[a-z]+$/.test(answer) || !/^[a-z]+$/.test(expected)) return false;
  if (expected.length < 4) return false;
  const allowed = expected.length >= 8 ? 2 : 1;
  return editDistance(answer, expected) <= allowed;
}

/**
 * Splits a line into words, numbers and single punctuation marks, so that
 * punctuation attached to a word ("recovered:") doesn't stop the word from
 * being compared on its own.
 */
function tokenize(line: string): string[] {
  return line.match(/[a-z]+|\d+|[^\sa-z\d]/g) ?? [];
}

/**
 * Same lines and tokens as expected, allowing small spelling slips in words.
 * Numbers and punctuation must match exactly.
 */
function matchesWithTypos(answer: string, expected: string): boolean {
  const answerLines = looseOutput(answer).split("\n");
  const expectedLines = looseOutput(expected).split("\n");
  if (answerLines.length !== expectedLines.length) return false;
  return expectedLines.every((line, i) => {
    const want = tokenize(line);
    const got = tokenize(answerLines[i] ?? "");
    return (
      got.length === want.length &&
      want.every((token, j) => {
        const gotToken = got[j] ?? "";
        return gotToken === token || isWordTypo(gotToken, token);
      })
    );
  });
}

export function gradeCodeOutput(answer: string, expected: string): GradeResult {
  if (normalizeOutput(answer) === normalizeOutput(expected)) {
    return { score: 1, isCorrect: true, feedback: "Exactly right." };
  }
  if (looseOutput(answer) === looseOutput(expected)) {
    return {
      score: 0.8,
      isCorrect: true,
      feedback: "Right values. Check the exact formatting (quotes, spacing or case).",
    };
  }
  if (matchesWithTypos(answer, expected)) {
    return {
      score: 0.75,
      isCorrect: true,
      feedback:
        "Right values, with a small spelling slip. Compare your text with the model answer.",
    };
  }
  return { score: 0, isCorrect: false, feedback: "That's not what this code prints." };
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(1, Math.max(0, score));
}

export function isPassingScore(score: number): boolean {
  return clampScore(score) >= CORRECT_SCORE_THRESHOLD;
}
