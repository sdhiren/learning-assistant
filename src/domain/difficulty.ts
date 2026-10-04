export const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

/** What each level means, used both in the UI and in prompts to Claude. */
export const DIFFICULTY_DESCRIPTIONS: Readonly<Record<Difficulty, string>> = {
  easy: "Definitions and fundamentals: can you recall and recognise the core ideas?",
  medium: "Applied understanding: typical phone-screen questions about how and why.",
  hard: "Trade-offs, edge cases and debugging: on-site interview depth.",
  expert: "Internals, performance and design judgement: senior/staff-level depth.",
};

/** Harder questions count for more when estimating mastery. */
export const DIFFICULTY_WEIGHTS: Readonly<Record<Difficulty, number>> = {
  easy: 1,
  medium: 1.5,
  hard: 2,
  expert: 2.5,
};
