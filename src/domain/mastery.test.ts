import { describe, expect, it } from "vitest";

import { computeMastery, computeTopicProgress, type AttemptEvidence } from "./mastery";

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));
const attempt = (
  score: number,
  minute: number,
  difficulty: AttemptEvidence["difficulty"] = "medium",
) => ({
  score,
  difficulty,
  answeredAt: at(minute),
});

describe("computeMastery", () => {
  it("reports not started without attempts", () => {
    expect(computeMastery([])).toEqual({ level: "not_started", score: null, attemptCount: 0 });
  });

  it("does not call a concept strong after a single correct answer", () => {
    expect(computeMastery([attempt(1, 1)]).level).toBe("developing");
  });

  it("calls a concept strong after repeated correct answers", () => {
    const mastery = computeMastery([attempt(1, 1), attempt(1, 2), attempt(1, 3)]);
    expect(mastery).toMatchObject({ level: "strong", score: 1, attemptCount: 3 });
  });

  it("flags mostly-wrong concepts as weak", () => {
    expect(computeMastery([attempt(0, 1), attempt(0, 2), attempt(1, 3)]).level).toBe("weak");
  });

  it("weights recent attempts more than old ones, regardless of input order", () => {
    const improving = computeMastery([attempt(1, 3), attempt(0, 1), attempt(0, 2)]);
    const declining = computeMastery([attempt(1, 1), attempt(0, 2), attempt(0, 3)]);
    expect(improving.score).toBeGreaterThan(declining.score!);
  });

  it("weights harder questions more", () => {
    const hardCorrect = computeMastery([attempt(0, 1, "easy"), attempt(1, 1, "expert")]);
    const easyCorrect = computeMastery([attempt(1, 1, "easy"), attempt(0, 1, "expert")]);
    expect(hardCorrect.score).toBeGreaterThan(easyCorrect.score!);
  });
});

describe("computeTopicProgress", () => {
  it("counts unpractised concepts as zero", () => {
    const progress = computeTopicProgress([
      { level: "strong", score: 1, attemptCount: 3 },
      { level: "not_started", score: null, attemptCount: 0 },
    ]);
    expect(progress).toBe(0.5);
  });

  it("is zero for a topic without concepts", () => {
    expect(computeTopicProgress([])).toBe(0);
  });
});
