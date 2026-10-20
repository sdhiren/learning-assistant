import { z } from "zod";

import { QUESTION_TYPES } from "@/domain/question";

/**
 * Shapes Claude must return. They are deliberately flat and permissive
 * (e.g. nullable fields instead of unions) so the model can fill them
 * reliably; stricter, per-type rules are applied afterwards in the services.
 */

const conceptSchema = z.object({
  name: z.string().min(1).describe("Short concept name, e.g. 'Event loop phases'."),
  summary: z.string().min(1).describe("One sentence on what the learner must understand."),
});

const subtopicConceptsSchema = z.array(conceptSchema).min(2).max(6);

export const skillTreeSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe("Two-sentence overview of the topic for an interview candidate."),
  subtopics: z
    .array(z.object({ name: z.string().min(1), concepts: subtopicConceptsSchema }))
    .min(3)
    .max(6),
});
export type SkillTreeOutput = z.infer<typeof skillTreeSchema>;

export const newSubtopicSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("A concise, clean title for the subtopic (fix casing and typos; keep its meaning)."),
  concepts: subtopicConceptsSchema,
});
export type NewSubtopicOutput = z.infer<typeof newSubtopicSchema>;

export const generatedQuizSchema = z.object({
  questions: z.array(
    z.object({
      conceptId: z.string().describe("Must be one of the concept ids provided."),
      type: z.enum(QUESTION_TYPES),
      prompt: z.string().min(1).describe("The question text, without the code snippet."),
      code: z
        .string()
        .nullable()
        .describe(
          "code_output: the snippet. coding_challenge: starter code (signature plus a TODO, " +
            "never the solution). Optional otherwise; null if unused.",
        ),
      codeLanguage: z
        .string()
        .nullable()
        .describe("e.g. 'javascript', 'python'. Null without code."),
      options: z
        .array(z.string())
        .describe("Exactly 4 distinct options for multiple_choice; empty array otherwise."),
      correctOptionIndex: z
        .number()
        .int()
        .nullable()
        .describe("0-based index of the correct option for multiple_choice; null otherwise."),
      expectedAnswer: z
        .string()
        .nullable()
        .describe(
          "short_answer: a concise model answer. code_output: the exact program output. " +
            "coding_challenge: a complete, idiomatic reference solution. multiple_choice: null.",
        ),
      rubric: z
        .array(z.string())
        .describe(
          "short_answer: 2-4 key points a strong answer covers. coding_challenge: 3-5 points " +
            "covering correctness, edge cases and time/space complexity. Empty array otherwise.",
        ),
      explanation: z.string().min(1).describe("Why the answer is correct, teaching the concept."),
    }),
  ),
});
export type GeneratedQuizOutput = z.infer<typeof generatedQuizSchema>;
export type GeneratedQuestion = GeneratedQuizOutput["questions"][number];

export const codeReviewSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("0 to 1. 1 = correct, handles the edge cases and has appropriate complexity."),
  summary: z.string().min(1).describe("One or two sentences: the overall verdict."),
  correctness: z.string().min(1).describe("Does it solve the problem? Point to any bug."),
  edgeCases: z.string().min(1).describe("Which edge cases are handled or missed."),
  complexity: z.string().min(1).describe("Time and space complexity, and whether it's fitting."),
});
export type CodeReviewOutput = z.infer<typeof codeReviewSchema>;

export const shortAnswerGradeSchema = z.object({
  score: z.number().min(0).max(1).describe("0 to 1. 1 = covers every rubric point accurately."),
  feedback: z.string().min(1).describe("Two or three sentences of direct, constructive feedback."),
  missedPoints: z.array(z.string()).describe("Rubric points the answer missed or got wrong."),
});
export type ShortAnswerGradeOutput = z.infer<typeof shortAnswerGradeSchema>;

export const readingSchema = z.object({
  markdown: z
    .string()
    .min(1)
    .describe("The lesson in GitHub-flavoured Markdown, following the requested ## sections."),
  keyTakeaways: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("Short, plain-language points worth memorising for interviews."),
});
export type ReadingOutput = z.infer<typeof readingSchema>;
