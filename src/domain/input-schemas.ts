import { z } from "zod";

import { DIFFICULTIES } from "./difficulty";

/** Validation for everything a user can submit. Shared by server actions and forms. */

export const TOPIC_NAME_MAX_LENGTH = 80;
export const TOPIC_GOAL_MAX_LENGTH = 300;
export const SUBTOPIC_NAME_MAX_LENGTH = 80;
export const SUBTOPIC_NOTES_MAX_LENGTH = 300;
export const ANSWER_MAX_LENGTH = 4000;
export const QUESTION_COUNT_OPTIONS = [5, 10] as const;

const MAX_ANSWER_TIME_MS = 60 * 60 * 1000;

/** Rejects control characters (other than tab and newline) in free text. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F]/;

const singleLineText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Must be at most ${maxLength} characters.`)
    .refine((value) => !CONTROL_CHARACTERS.test(value) && !value.includes("\n"), {
      message: "Contains characters that aren't allowed.",
    });

export const id = z.uuid({ message: "Invalid id." });

export const createTopicInput = z.object({
  name: singleLineText(TOPIC_NAME_MAX_LENGTH).pipe(
    z.string().min(2, "Enter a topic name (at least 2 characters)."),
  ),
  goal: singleLineText(TOPIC_GOAL_MAX_LENGTH).optional().default(""),
});
export type CreateTopicInput = z.infer<typeof createTopicInput>;

export const addSubtopicInput = z.object({
  topicId: id,
  name: singleLineText(SUBTOPIC_NAME_MAX_LENGTH).pipe(
    z.string().min(2, "Enter a subtopic name (at least 2 characters)."),
  ),
  notes: singleLineText(SUBTOPIC_NOTES_MAX_LENGTH).optional().default(""),
});
export type AddSubtopicInput = z.infer<typeof addSubtopicInput>;

/** What a quiz concentrates on. */
export type QuizFocus =
  { kind: "weak_spots" } | { kind: "concept"; id: string } | { kind: "subtopic"; id: string };

const FOCUS_PATTERN = /^(concept|subtopic):(.+)$/;

/** Encodes a quiz focus as a single form value, e.g. "subtopic:<uuid>". */
export function encodeQuizFocus(focus: QuizFocus): string {
  return focus.kind === "weak_spots" ? "" : `${focus.kind}:${focus.id}`;
}

/** Parses a form value produced by encodeQuizFocus. Empty means "my weak spots". */
export const quizFocus = z
  .string()
  .optional()
  .transform((value, context): QuizFocus => {
    if (!value) return { kind: "weak_spots" };
    const match = FOCUS_PATTERN.exec(value);
    const parsedId = id.safeParse(match?.[2]);
    if (!match || !parsedId.success) {
      context.addIssue({ code: "custom", message: "Choose what the quiz should focus on." });
      return z.NEVER;
    }
    return { kind: match[1] === "concept" ? "concept" : "subtopic", id: parsedId.data };
  });

export const startQuizInput = z.object({
  topicId: id,
  difficulty: z.enum(DIFFICULTIES, { message: "Choose a difficulty." }),
  questionCount: z.coerce
    .number()
    .refine((value) => (QUESTION_COUNT_OPTIONS as readonly number[]).includes(value), {
      message: "Choose a quiz length.",
    }),
  focus: quizFocus,
});
export type StartQuizInput = z.infer<typeof startQuizInput>;

export const submitAnswerInput = z.object({
  questionId: id,
  answer: z
    .string()
    .max(ANSWER_MAX_LENGTH, `Answers are limited to ${ANSWER_MAX_LENGTH} characters.`)
    .refine((value) => value.trim().length > 0, { message: "Enter an answer first." }),
  timeTakenMs: z.number().int().min(0).max(MAX_ANSWER_TIME_MS).catch(0),
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;

export const finishQuizInput = z.object({ quizId: id });
