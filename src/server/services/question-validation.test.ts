import { describe, expect, it } from "vitest";

import {
  codeOutputQuestion,
  codingChallengeQuestion,
  multipleChoiceQuestion,
  shortAnswerQuestion,
} from "@/test/test-app";

import { toQuestionDraft } from "./question-validation";

const allowed = new Set(["c1"]);

describe("toQuestionDraft", () => {
  it("accepts well-formed questions of every type", () => {
    expect(toQuestionDraft(multipleChoiceQuestion("c1"), allowed)?.type).toBe("multiple_choice");
    expect(toQuestionDraft(shortAnswerQuestion("c1"), allowed)?.type).toBe("short_answer");
    expect(toQuestionDraft(codeOutputQuestion("c1"), allowed)).toMatchObject({
      type: "code_output",
      codeLanguage: "javascript",
    });
  });

  it("rejects questions for concepts outside the quiz", () => {
    expect(toQuestionDraft(multipleChoiceQuestion("other"), allowed)).toBeNull();
  });

  it.each([
    ["three options", { options: ["a", "b", "c"] }],
    ["duplicate options", { options: ["a", "A", "b", "c"] }],
    ["an out-of-range answer index", { correctOptionIndex: 4 }],
    ["a missing answer index", { correctOptionIndex: null }],
  ])("rejects multiple choice with %s", (_case, override) => {
    expect(toQuestionDraft({ ...multipleChoiceQuestion("c1"), ...override }, allowed)).toBeNull();
  });

  it("rejects code-output questions without code or expected output", () => {
    expect(toQuestionDraft({ ...codeOutputQuestion("c1"), code: "  " }, allowed)).toBeNull();
    expect(
      toQuestionDraft({ ...codeOutputQuestion("c1"), expectedAnswer: null }, allowed),
    ).toBeNull();
  });

  it("tidies generated code before storing it", () => {
    const code = "```js\n  console.log(1);  \n```";
    expect(toQuestionDraft({ ...codeOutputQuestion("c1"), code }, allowed)?.code).toBe(
      "console.log(1);",
    );
  });

  it("rejects short-answer questions without a rubric", () => {
    expect(toQuestionDraft({ ...shortAnswerQuestion("c1"), rubric: [" "] }, allowed)).toBeNull();
  });

  describe("coding challenges", () => {
    it("accepts a challenge with starter code, a solution and a rubric", () => {
      expect(toQuestionDraft(codingChallengeQuestion("c1"), allowed)).toMatchObject({
        type: "coding_challenge",
        codeLanguage: "javascript",
        code: "function sumEven(nums) {\n  // TODO\n}",
        rubric: ["Returns the correct sum", "Handles an empty array", "Runs in O(n)"],
      });
    });

    it.each([
      ["no starter code", { code: null }],
      ["no reference solution", { expectedAnswer: null }],
      [
        "a solution identical to the starter code",
        { expectedAnswer: "function sumEven(nums) {\n  // TODO\n}" },
      ],
      ["a one-point rubric", { rubric: ["Correct"] }],
    ])("rejects a challenge with %s", (_case, override) => {
      expect(
        toQuestionDraft({ ...codingChallengeQuestion("c1"), ...override }, allowed),
      ).toBeNull();
    });
  });
});
