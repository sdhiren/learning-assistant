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
  return { score: 0, isCorrect: false, feedback: "That's not what this code prints." };
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(1, Math.max(0, score));
}

export function isPassingScore(score: number): boolean {
  return clampScore(score) >= CORRECT_SCORE_THRESHOLD;
}
