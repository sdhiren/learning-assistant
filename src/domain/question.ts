export const QUESTION_TYPES = ["multiple_choice", "short_answer", "code_output"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  multiple_choice: "Multiple choice",
  short_answer: "Short answer",
  code_output: "What does this code print?",
};

export const MULTIPLE_CHOICE_OPTION_COUNT = 4;

/** A short-answer score at or above this threshold counts as correct. */
export const CORRECT_SCORE_THRESHOLD = 0.7;

interface QuestionBase {
  conceptId: string;
  prompt: string;
  /** Optional supporting snippet (required for code_output questions). */
  code: string | null;
  codeLanguage: string | null;
  explanation: string;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: "multiple_choice";
  options: string[];
  correctOptionIndex: number;
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: "short_answer";
  /** A model answer shown after grading. */
  expectedAnswer: string;
  /** Key points the grader looks for. */
  rubric: string[];
}

export interface CodeOutputQuestion extends QuestionBase {
  type: "code_output";
  code: string;
  /** The exact program output. */
  expectedAnswer: string;
}

/** A fully validated question, ready to be stored. */
export type QuestionDraft = MultipleChoiceQuestion | ShortAnswerQuestion | CodeOutputQuestion;
