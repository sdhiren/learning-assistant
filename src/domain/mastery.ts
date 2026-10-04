import { DIFFICULTY_WEIGHTS, type Difficulty } from "./difficulty";

export const MASTERY_LEVELS = ["not_started", "weak", "developing", "strong"] as const;

export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export const MASTERY_LEVEL_LABELS: Readonly<Record<MasteryLevel, string>> = {
  not_started: "Not started",
  weak: "Needs work",
  developing: "Developing",
  strong: "Strong",
};

export interface AttemptEvidence {
  /** 0 to 1. */
  score: number;
  difficulty: Difficulty;
  answeredAt: Date;
}

export interface Mastery {
  level: MasteryLevel;
  /** Weighted, recency-biased score from 0 to 1, or null with no attempts. */
  score: number | null;
  attemptCount: number;
}

/** Each older attempt counts this much less than the one after it. */
const RECENCY_DECAY = 0.8;
const WEAK_BELOW = 0.5;
const STRONG_AT_OR_ABOVE = 0.8;
/** "Strong" requires repeated evidence, not one lucky answer. */
const MIN_ATTEMPTS_FOR_STRONG = 3;

/**
 * Estimates mastery of a single concept. Recent attempts and harder
 * questions carry more weight, so improvement shows up quickly and easy
 * wins don't inflate the score.
 */
export function computeMastery(attempts: readonly AttemptEvidence[]): Mastery {
  if (attempts.length === 0) {
    return { level: "not_started", score: null, attemptCount: 0 };
  }

  const chronological = [...attempts].sort(
    (a, b) => a.answeredAt.getTime() - b.answeredAt.getTime(),
  );
  const newestIndex = chronological.length - 1;

  let weightedSum = 0;
  let totalWeight = 0;
  chronological.forEach((attempt, index) => {
    const weight = DIFFICULTY_WEIGHTS[attempt.difficulty] * RECENCY_DECAY ** (newestIndex - index);
    weightedSum += attempt.score * weight;
    totalWeight += weight;
  });

  const score = weightedSum / totalWeight;
  return { level: levelFor(score, attempts.length), score, attemptCount: attempts.length };
}

function levelFor(score: number, attemptCount: number): MasteryLevel {
  if (score < WEAK_BELOW) return "weak";
  if (score >= STRONG_AT_OR_ABOVE && attemptCount >= MIN_ATTEMPTS_FOR_STRONG) return "strong";
  return "developing";
}

/**
 * Topic-level progress: the mean concept score, where concepts that have
 * never been practised count as zero. This rewards both accuracy and coverage.
 */
export function computeTopicProgress(conceptMasteries: readonly Mastery[]): number {
  if (conceptMasteries.length === 0) return 0;
  const total = conceptMasteries.reduce((sum, mastery) => sum + (mastery.score ?? 0), 0);
  return total / conceptMasteries.length;
}
