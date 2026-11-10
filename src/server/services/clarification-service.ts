import { randomUUID } from "node:crypto";

import {
  MAX_CLARIFICATIONS_PER_QUESTION,
  type AskClarificationInput,
} from "@/domain/input-schemas";
import { AiGenerationError, NotFoundError, ValidationError } from "@/lib/errors";
import type { LlmClient } from "@/server/ai/llm-client";
import {
  buildAnswerDiscussionPrompt,
  buildQuestionClarificationPrompt,
  optionLetter,
  type ClarificationTurn,
  type Prompt,
  type PublicQuestion,
} from "@/server/ai/prompts";
import { clarificationSchema } from "@/server/ai/schemas";
import type {
  AttemptRow,
  ClarificationRow,
  ClarificationStage,
  QuestionRow,
} from "@/server/db/schema";
import type { ClarificationRepository } from "@/server/repositories/clarification-repository";
import type { QuizRepository } from "@/server/repositories/quiz-repository";
import type { TopicRepository } from "@/server/repositories/topic-repository";

import { correctAnswerFor, toClarificationView } from "./quiz-service";
import type { ClarificationView } from "./view-models";

/** Earlier messages sent to the model with each follow-up. */
const MAX_HISTORY_MESSAGES = 10;

/**
 * Follow-up questions about a quiz question. The server picks the mode: with
 * no attempt yet, the model sees only what the learner sees (never the answer
 * key) and won't help answer; afterwards it discusses the full answer.
 * Clarifications never read or change attempts or scores.
 */
export class ClarificationService {
  constructor(
    private readonly quizRepository: QuizRepository,
    private readonly topicRepository: TopicRepository,
    private readonly clarificationRepository: ClarificationRepository,
    private readonly llm: LlmClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Asks a follow-up and returns the stored learner message and reply. */
  async ask(input: AskClarificationInput): Promise<ClarificationView[]> {
    const question = this.quizRepository.findQuestionById(input.questionId);
    if (!question) throw new NotFoundError("Question not found.");
    const quiz = this.quizRepository.findById(question.quizId);
    const topic = quiz && this.topicRepository.findById(quiz.topicId);
    if (!quiz || !topic) throw new NotFoundError("Question not found.");

    if (
      this.clarificationRepository.countLearnerMessages(question.id) >=
      MAX_CLARIFICATIONS_PER_QUESTION
    ) {
      throw new ValidationError(
        `You've asked ${MAX_CLARIFICATIONS_PER_QUESTION} follow-ups about this question, the most allowed.`,
      );
    }

    const askedAt = this.now();
    // Fixed now: if the learner answers while this call runs, the reply still
    // belongs to the pre-answer stage (and was written without the key).
    const attempt = this.quizRepository.findAttempt(question.id);
    const stage: ClarificationStage = attempt ? "after_answer" : "before_answer";
    const history = this.clarificationRepository
      .listForQuestion(question.id)
      .slice(-MAX_HISTORY_MESSAGES)
      .map((row): ClarificationTurn => ({ role: row.role, content: row.content }));
    const context = {
      topicName: topic.name,
      difficulty: quiz.difficulty,
      conceptName: this.topicRepository.findConceptById(question.conceptId)?.name ?? "",
      question: publicQuestion(question),
      history,
      message: input.message,
    };

    const output = await this.llm.generateStructured({
      task: attempt ? "discuss-answer" : "clarify-question",
      ...(attempt
        ? answerDiscussionPrompt(context, question, attempt)
        : buildQuestionClarificationPrompt(context)),
      schema: clarificationSchema,
      effort: "medium",
      quizId: quiz.id,
      conceptId: question.conceptId,
    });

    const reply = output.reply.trim();
    if (!reply) {
      throw new AiGenerationError(
        `${this.llm.providerLabel} didn't reply. Please try asking again.`,
      );
    }

    const repliedAt = new Date(Math.max(this.now().getTime(), askedAt.getTime() + 1));
    const learnerRow = row(question, "learner", stage, input.message, askedAt);
    const assistantRow = row(question, "assistant", stage, reply, repliedAt);
    this.clarificationRepository.appendExchange(learnerRow, assistantRow);
    return [learnerRow, assistantRow].map(toClarificationView);
  }
}

/** Picks, field by field, only what an unanswered question shows the learner. */
function publicQuestion(question: QuestionRow): PublicQuestion {
  return {
    type: question.type,
    prompt: question.prompt,
    // A coding challenge's code is its starter code, which the learner sees.
    code: question.code,
    codeLanguage: question.codeLanguage,
    options: question.options,
  };
}

function answerDiscussionPrompt(
  context: Omit<Parameters<typeof buildAnswerDiscussionPrompt>[0], AnswerFields>,
  question: QuestionRow,
  attempt: AttemptRow,
): Prompt {
  const isChoice = question.type === "multiple_choice";
  const options = question.options ?? [];
  return buildAnswerDiscussionPrompt({
    ...context,
    correctAnswer: isChoice
      ? optionLabel(options, question.correctOptionIndex ?? -1)
      : correctAnswerFor(question),
    rubric: question.rubric ?? [],
    explanation: question.explanation,
    learnerAnswer: attempt.skipped
      ? null
      : isChoice
        ? optionLabel(options, Number(attempt.answer))
        : attempt.answer,
    score: attempt.score,
    feedback: attempt.feedback,
  });
}

type AnswerFields =
  "correctAnswer" | "rubric" | "explanation" | "learnerAnswer" | "score" | "feedback";

/** An option as "B. text", matching the <options> list. */
function optionLabel(options: readonly string[], index: number): string {
  const option = options[index];
  return option === undefined ? "" : `${optionLetter(index)}. ${option}`;
}

function row(
  question: QuestionRow,
  role: ClarificationRow["role"],
  stage: ClarificationStage,
  content: string,
  createdAt: Date,
): ClarificationRow {
  return { id: randomUUID(), questionId: question.id, role, stage, content, createdAt };
}
