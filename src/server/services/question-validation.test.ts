import { describe, expect, it } from "vitest";

import { codeOutputQuestion, multipleChoiceQuestion, shortAnswerQuestion } from "@/test/test-app";

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

  it("rejects short-answer questions without a rubric", () => {
    expect(toQuestionDraft({ ...shortAnswerQuestion("c1"), rubric: [" "] }, allowed)).toBeNull();
  });
});
