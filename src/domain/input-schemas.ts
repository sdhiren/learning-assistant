import { z } from "zod";

import { DIFFICULTIES } from "./difficulty";
import { EXPERIENCE_LEVELS } from "./profile";
import type { QuestionType } from "./question";

/** Validation for everything a user can submit. Shared by server actions and forms. */

export const TOPIC_NAME_MAX_LENGTH = 80;
export const TOPIC_GOAL_MAX_LENGTH = 300;
export const SUBTOPIC_NAME_MAX_LENGTH = 80;
export const SUBTOPIC_NOTES_MAX_LENGTH = 300;
export const INSTRUCTIONS_MAX_LENGTH = 300;
export const ANSWER_MAX_LENGTH = 4000;
/** Coding-challenge solutions are code, so they get more room. */
export const CODE_ANSWER_MAX_LENGTH = 12_000;
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

/**
 * Optional learner instructions for generation, e.g. "focus on Go 1.22 loop
 * semantics". Newlines are allowed; other control characters aren't.
 */
const learnerInstructions = z
  .string()
  .trim()
  .max(
    INSTRUCTIONS_MAX_LENGTH,
    `Instructions must be at most ${INSTRUCTIONS_MAX_LENGTH} characters.`,
  )
  .refine((value) => !CONTROL_CHARACTERS.test(value), {
    message: "Contains characters that aren't allowed.",
  })
  .optional()
  .default("");

export const id = z.uuid({ message: "Invalid id." });

export const createTopicInput = z.object({
  name: singleLineText(TOPIC_NAME_MAX_LENGTH).pipe(
    z.string().min(2, "Enter a topic name (at least 2 characters)."),
  ),
  goal: singleLineText(TOPIC_GOAL_MAX_LENGTH).optional().default(""),
});
export type CreateTopicInput = z.infer<typeof createTopicInput>;

/** Dismissing a suggested topic; it is identified by its name. */
export const dismissSuggestionInput = createTopicInput.pick({ name: true });

export const addSubtopicInput = z.object({
  topicId: id,
  name: singleLineText(SUBTOPIC_NAME_MAX_LENGTH).pipe(
    z.string().min(2, "Enter a subtopic name (at least 2 characters)."),
  ),
  notes: singleLineText(SUBTOPIC_NOTES_MAX_LENGTH).optional().default(""),
});
export type AddSubtopicInput = z.infer<typeof addSubtopicInput>;

export const deleteSubtopicInput = z.object({ topicId: id, subtopicId: id });

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
  instructions: learnerInstructions,
});
export type StartQuizInput = z.infer<typeof startQuizInput>;

export const generateReadingInput = z.object({
  topicId: id,
  conceptId: id,
  instructions: learnerInstructions,
});
export type GenerateReadingInput = z.infer<typeof generateReadingInput>;

export const submitAnswerInput = z.object({
  questionId: id,
  answer: z
    .string()
    // The per-type limit (see maxAnswerLength) is enforced once the question is known.
    .max(CODE_ANSWER_MAX_LENGTH, `Answers are limited to ${CODE_ANSWER_MAX_LENGTH} characters.`)
    .refine((value) => value.trim().length > 0, { message: "Enter an answer first." }),
  timeTakenMs: z.number().int().min(0).max(MAX_ANSWER_TIME_MS).catch(0),
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerInput>;

export const finishQuizInput = z.object({ quizId: id });

/** The longest answer accepted for a question type. */
export function maxAnswerLength(type: QuestionType): number {
  return type === "coding_challenge" ? CODE_ANSWER_MAX_LENGTH : ANSWER_MAX_LENGTH;
}

// --- Profiles and sign-in ----------------------------------------------------

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 50;
export const TARGET_ROLE_MAX_LENGTH = 80;
export const INTEREST_MAX_LENGTH = 40;
export const MAX_INTERESTS = 10;

/** Usernames are unique ignoring case; the registry compares their lower-cased form. */
export const username = z
  .string({ message: "Enter a username." })
  .trim()
  .min(USERNAME_MIN_LENGTH, `Usernames are at least ${USERNAME_MIN_LENGTH} characters.`)
  .max(USERNAME_MAX_LENGTH, `Usernames are at most ${USERNAME_MAX_LENGTH} characters.`)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Use letters, digits, dots, dashes or underscores.");

/** Passwords are never trimmed: every character counts. */
export const password = z
  .string({ message: "Enter a password." })
  .min(PASSWORD_MIN_LENGTH, `Passwords are at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`);

const requiredName = (label: string) =>
  singleLineText(NAME_MAX_LENGTH).pipe(z.string().min(1, `Enter your ${label}.`));

/** 1–10 interests, each a short single line, deduplicated ignoring case. */
export const interests = z
  .array(singleLineText(INTEREST_MAX_LENGTH))
  .transform((values) => {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .pipe(
    z
      .array(z.string())
      .min(1, "Pick at least one interest.")
      .max(MAX_INTERESTS, `Pick at most ${MAX_INTERESTS} interests.`),
  );

/** A password typed twice; the error lands on `confirmPassword`. */
const withConfirmation = <T extends { password: string; confirmPassword: string }>(
  value: T,
  context: z.RefinementCtx,
) => {
  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "The passwords don't match.",
    });
  }
};

export const registerInput = z
  .object({
    username,
    password,
    confirmPassword: z.string(),
    firstName: requiredName("first name"),
    lastName: requiredName("last name"),
    targetRole: singleLineText(TARGET_ROLE_MAX_LENGTH).optional().default(""),
    experienceLevel: z.enum(EXPERIENCE_LEVELS, { message: "Choose your experience level." }),
    interests,
  })
  .superRefine(withConfirmation);
export type RegisterInput = z.infer<typeof registerInput>;

/** Sign-in only checks presence: the rules for new passwords don't apply to old ones. */
export const loginInput = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(USERNAME_MAX_LENGTH),
  password: z.string().max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginInput>;

export const setInitialPasswordInput = z
  .object({ username, password, confirmPassword: z.string() })
  .superRefine(withConfirmation);
export type SetInitialPasswordInput = z.infer<typeof setInitialPasswordInput>;

export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX_LENGTH),
    password,
    confirmPassword: z.string(),
  })
  .superRefine(withConfirmation);
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;

export const updateProfileInput = z.object({
  firstName: requiredName("first name"),
  lastName: requiredName("last name"),
  targetRole: singleLineText(TARGET_ROLE_MAX_LENGTH).optional().default(""),
  experienceLevel: z.enum(EXPERIENCE_LEVELS, { message: "Choose your experience level." }),
  interests,
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

/** Mirrors `PROVIDER_IDS` in src/server/ai/providers.ts (domain can't import the server). */
export const AI_PROVIDER_CHOICES = ["claude-code", "anthropic", "openai", "gemini"] as const;
export const SECRET_KIND_CHOICES = [
  "api_key:anthropic",
  "api_key:openai",
  "api_key:gemini",
  "claude_oauth_token",
] as const;
export const AI_MODEL_MAX_LENGTH = 80;
export const SECRET_MAX_LENGTH = 512;

/** A pasted key or token. Error messages never echo the value. */
const secretValue = z
  .string()
  .trim()
  .max(SECRET_MAX_LENGTH, "That's too long for a key.")
  .regex(/^\S*$/, "Keys don't contain spaces.");

export const aiSettingsInput = z.object({
  provider: z.enum(AI_PROVIDER_CHOICES, { message: "Choose a provider." }),
  model: z
    .string()
    .trim()
    .max(AI_MODEL_MAX_LENGTH)
    .regex(/^[A-Za-z0-9._:/@-]*$/, "Model ids use letters, digits and . _ : / @ -")
    .optional()
    .default(""),
  apiKey: secretValue.optional().default(""),
});
export type AiSettingsInput = z.infer<typeof aiSettingsInput>;

export const claudeTokenInput = z.object({
  token: secretValue.pipe(z.string().min(1, "Paste the token.")),
});

export const claudeSignInCodeInput = z.object({
  flowId: id,
  code: z
    .string()
    .trim()
    .min(1, "Paste the code.")
    .max(SECRET_MAX_LENGTH, "That code is too long.")
    .regex(/^\S+$/, "Codes don't contain spaces."),
});

export const removeSecretInput = z.object({ kind: z.enum(SECRET_KIND_CHOICES) });

/**
 * Where to go after signing in. Only same-site paths are allowed: a value
 * like `//evil.example` or `https://…` would make sign-in an open redirect.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || CONTROL_CHARACTERS.test(value)) return "/";
  return value;
}
