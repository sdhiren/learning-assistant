import { describe, expect, it } from "vitest";

import {
  clampScore,
  gradeCodeOutput,
  gradeMultipleChoice,
  isPassingScore,
  normalizeOutput,
} from "./grading";

describe("gradeMultipleChoice", () => {
  it("gives full marks only for the correct option", () => {
    expect(gradeMultipleChoice(2, 2)).toMatchObject({ score: 1, isCorrect: true });
    expect(gradeMultipleChoice(1, 2)).toMatchObject({ score: 0, isCorrect: false });
  });
});

describe("normalizeOutput", () => {
  it("ignores line-ending style, trailing spaces and surrounding blank lines", () => {
    expect(normalizeOutput("\r\n1  \r\n2\r\n\n")).toBe("1\n2");
  });

  it("preserves meaningful interior whitespace", () => {
    expect(normalizeOutput("a  b")).toBe("a  b");
  });
});

describe("gradeCodeOutput", () => {
  it("accepts an exact match", () => {
    expect(gradeCodeOutput("[1, 2]\n", "[1, 2]")).toMatchObject({ score: 1, isCorrect: true });
  });

  it("gives partial credit when only quotes, spacing or case differ", () => {
    expect(gradeCodeOutput("['a', 'b']", '["a",  "b"]')).toMatchObject({
      score: 0.8,
      isCorrect: true,
    });
  });

  it("rejects different output", () => {
    expect(gradeCodeOutput("3", "2")).toMatchObject({ score: 0, isCorrect: false });
  });
});

describe("score helpers", () => {
  it("clamps scores into 0..1 and treats non-numbers as 0", () => {
    expect(clampScore(1.4)).toBe(1);
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);
  });

  it("passes at the 0.7 threshold", () => {
    expect(isPassingScore(0.7)).toBe(true);
    expect(isPassingScore(0.69)).toBe(false);
  });
});
