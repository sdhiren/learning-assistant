/** How experienced a learner is; it tunes suggestions and prompts. */
export const EXPERIENCE_LEVELS = ["junior", "mid", "senior", "staff"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  junior: "Junior (0–2 years)",
  mid: "Mid-level (2–5 years)",
  senior: "Senior (5+ years)",
  staff: "Staff / principal",
};
