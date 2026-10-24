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

  it("passes with reduced credit when a word has a small typo", () => {
    expect(
      gradeCodeOutput(
        "closure 1\nclousure  0\narg 0\nresult 12",
        "closure 1\nclosure 0\narg 0\nresult 12",
      ),
    ).toMatchObject({ score: 0.75, isCorrect: true });
  });

  it("forgives a typo in a word that has punctuation attached", () => {
    const expected = "process defer 2\nprocess defer 1\nrecovered: boom\nmain deferred";
    expect(
      gradeCodeOutput("process defer 2\nprocess defer 1\nrecoverd: boom\nmain deferred", expected),
    ).toMatchObject({ score: 0.75, isCorrect: true });
    expect(gradeCodeOutput("(sucess), done.", "(success), done.")).toMatchObject({
      isCorrect: true,
    });
  });

  it("gives credit when only the line breaks differ", () => {
    // fmt.Print(v, " ") in a loop, then fmt.Println: everything is on one line.
    expect(gradeCodeOutput("1 2\n0 false", "1 2 0 false")).toMatchObject({
      score: 0.8,
      isCorrect: true,
    });
    expect(gradeCodeOutput("a b", "a\nb")?.feedback).toContain("line breaks differ");
  });

  // Rules never forgive a different value or order: these fall through to
  // Claude (null), which judges how much of the behaviour was understood.
  it("leaves misspelt words with different punctuation to Claude", () => {
    expect(gradeCodeOutput("recoverd; boom", "recovered: boom")).toBeNull();
    expect(gradeCodeOutput("map[a:1]", "map[a:2]")).toBeNull();
  });

  it("leaves different values or order to Claude", () => {
    expect(gradeCodeOutput("closure 2\nclosure 0", "closure 1\nclosure 0")).toBeNull();
    expect(gradeCodeOutput("ok true", "ok false")).toBeNull();
    expect(gradeCodeOutput("nul", "nil")).toBeNull();
    expect(gradeCodeOutput("result 12\narg 0", "arg 0\nresult 12")).toBeNull();
    expect(gradeCodeOutput("3", "2")).toBeNull();
    expect(gradeCodeOutput("2 1", "1\n2")).toBeNull();
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
