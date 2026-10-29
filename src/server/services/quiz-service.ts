import { randomUUID } from "node:crypto";

import { selectFocusConcepts } from "@/domain/concept-selection";
import {
  clampScore,
  gradeCodeOutput,
  gradeMultipleChoice,
  isPassingScore,
  type GradeResult,
} from "@/domain/grading";
import {
  maxAnswerLength,
  type QuizFocus,
  type StartQuizInput,
  type SubmitAnswerInput,
} from "@/domain/input-schemas";
import type { QuestionDraft } from "@/domain/question";
import { AiGenerationError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { LlmClient } from "@/server/ai/llm-client";
import {
  buildQuizPrompt,
  buildCodeReviewPrompt,
  buildOutputGradingPrompt,
  buildShortAnswerGradingPrompt,
  type QuizPromptConcept,
} from "@/server/ai/prompts";
import {
  codeReviewSchema,
  generatedQuizSchema,
  outputJudgementSchema,
  shortAnswerGradeSchema,
} from "@/server/ai/schemas";
import { isUniqueConstraintError } from "@/server/db/errors";
import type { AttemptRow, ConceptRow, QuestionRow, QuizRow, TopicRow } from "@/server/db/schema";
import type { QuizRepository } from "@/server/repositories/quiz-repository";
import type { TopicRepository } from "@/server/repositories/topic-repository";

import { masteryFor, type ProgressService } from "./progress-service";
import { focusLabelFor } from "./skill-map";
import { toQuestionDraft } from "./question-validation";
import type {
  AnswerResultView,
  QuizQuestionView,
  QuizSessionView,
  SubmitAnswerResultView,
} from "./view-models";

/** Only an output that matches (or nearly matches) earns more than this. */
const MAX_JUDGED_OUTPUT_SCORE = 0.9;
const RECENT_PROMPTS_TO_AVOID = 30;
/** Accept a quiz if at least this share of the generated questions are valid. */
const MIN_VALID_QUESTION_RATIO = 0.6;

export class QuizService {
  constructor(
    private readonly topicRepository: TopicRepository,
    private readonly quizRepository: QuizRepository,
    private readonly progressService: ProgressService,
    private readonly llm: LlmClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Generates a quiz on the chosen focus: the learner's weak spots across the
   * topic, a whole subtopic, or a single concept. Returns the new quiz id.
   */
  async startQuiz(input: StartQuizInput): Promise<string> {
    const topic = this.requireTopic(input.topicId);
    const concepts = this.topicRepository.listConcepts(topic.id);
    const candidates = this.candidateConcepts(topic.id, concepts, input.focus);

    const promptConcepts = this.planConcepts(topic.id, candidates, input);
    const generated = await this.llm.generateStructured({
      task: "generate-quiz",
      ...buildQuizPrompt({
        topicName: topic.name,
        goal: topic.goal,
        difficulty: input.difficulty,
        concepts: promptConcepts,
        recentQuestionPrompts: this.quizRepository.listRecentQuestionPrompts(
          topic.id,
          RECENT_PROMPTS_TO_AVOID,
        ),
        instructions: input.instructions,
      }),
      schema: generatedQuizSchema,
      effort: "medium",
      conceptId: input.focus.kind === "concept" ? input.focus.id : undefined,
    });

    const allowedConceptIds = new Set(promptConcepts.map((concept) => concept.id));
    const drafts = generated.questions
      .map((question) => toQuestionDraft(question, allowedConceptIds))
      .filter((draft): draft is QuestionDraft => draft !== null)
      .slice(0, input.questionCount);

    if (drafts.length < Math.ceil(input.questionCount * MIN_VALID_QUESTION_RATIO)) {
      throw new AiGenerationError(
        `${this.llm.providerLabel} produced too few usable questions for this quiz. Please try again.`,
      );
    }

    const quizId = randomUUID();
    const createdAt = this.now();
    this.quizRepository.createWithQuestions(
      {
        id: quizId,
        topicId: topic.id,
        difficulty: input.difficulty,
        focusConceptId: input.focus.kind === "concept" ? input.focus.id : null,
        focusSubtopicId: input.focus.kind === "subtopic" ? input.focus.id : null,
        status: "in_progress",
        instructions: input.instructions,
        createdAt,
      },
      drafts.map((draft, position) => toQuestionRow(draft, quizId, position)),
    );
    this.topicRepository.markStudied(topic.id, createdAt);
    return quizId;
  }

  getQuizSession(quizId: string): QuizSessionView {
    const quiz = this.requireQuiz(quizId);
    const topic = this.requireTopic(quiz.topicId);
    const concepts = this.topicRepository.listConcepts(topic.id);
    const conceptNames = new Map(concepts.map((concept) => [concept.id, concept.name]));
    const attemptsByQuestion = new Map(
      this.quizRepository
        .listAttemptsForQuiz(quiz.id)
        .map((attempt) => [attempt.questionId, attempt]),
    );

    return {
      id: quiz.id,
      topicId: topic.id,
      topicName: topic.name,
      difficulty: quiz.difficulty,
      focusLabel: focusLabelFor(quiz, this.topicRepository.listSubtopics(topic.id), concepts),
      instructions: quiz.instructions,
      status: quiz.status,
      score: quiz.score,
      questions: this.quizRepository.listQuestions(quiz.id).map((question): QuizQuestionView => {
        const attempt = attemptsByQuestion.get(question.id);
        return {
          id: question.id,
          position: question.position,
          type: question.type,
          conceptId: question.conceptId,
          conceptName: conceptNames.get(question.conceptId) ?? "",
          prompt: question.prompt,
          code: question.code,
          codeLanguage: question.codeLanguage,
          options: question.options,
          result: attempt ? toAnswerResult(question, attempt) : null,
        };
      }),
    };
  }

  async submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResultView> {
    const question = this.quizRepository.findQuestionById(input.questionId);
    if (!question) throw new NotFoundError("Question not found.");
    const quiz = this.requireQuiz(question.quizId);
    if (quiz.status === "completed") throw new ConflictError("This quiz is already finished.");
    if (this.quizRepository.hasAttempt(question.id)) {
      throw new ConflictError("You've already answered this question.");
    }
    const limit = maxAnswerLength(question.type);
    if (input.answer.length > limit) {
      throw new ValidationError(`Answers are limited to ${limit} characters.`);
    }

    const grade = await this.grade(question, quiz, input.answer);
    const answeredAt = this.now();
    const attempt: AttemptRow = {
      id: randomUUID(),
      questionId: question.id,
      answer: input.answer,
      score: grade.score,
      isCorrect: grade.isCorrect,
      skipped: false,
      feedback: grade.feedback,
      timeTakenMs: input.timeTakenMs,
      answeredAt,
    };

    let quizCompleted: boolean;
    try {
      quizCompleted = this.quizRepository.recordAttempt(attempt, quiz.id, answeredAt);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError("You've already answered this question.", { cause: error });
      }
      throw error;
    }
    this.topicRepository.markStudied(quiz.topicId, answeredAt);

    return { result: toAnswerResult(question, attempt), quizCompleted };
  }

  /**
   * Ends the quiz now: every unanswered question is recorded as skipped
   * (score 0, so it counts as a gap in mastery) and its answer is revealed.
   */
  finishQuiz(quizId: string): QuizSessionView {
    const quiz = this.requireQuiz(quizId);
    if (quiz.status === "completed") throw new ConflictError("This quiz is already finished.");

    const finishedAt = this.now();
    this.quizRepository.skipUnanswered(quiz.id, finishedAt, randomUUID);
    this.topicRepository.markStudied(quiz.topicId, finishedAt);
    return this.getQuizSession(quiz.id);
  }

  /** The concepts a quiz may draw from, after checking the focus belongs to this topic. */
  private candidateConcepts(
    topicId: string,
    concepts: readonly ConceptRow[],
    focus: QuizFocus,
  ): ConceptRow[] {
    switch (focus.kind) {
      case "weak_spots":
        return [...concepts];
      case "concept": {
        const concept = concepts.find((candidate) => candidate.id === focus.id);
        if (!concept) throw new NotFoundError("Concept not found in this topic.");
        return [concept];
      }
      case "subtopic": {
        const subtopic = this.topicRepository.findSubtopicById(focus.id);
        if (!subtopic || subtopic.topicId !== topicId) {
          throw new NotFoundError("Subtopic not found in this topic.");
        }
        const subtopicConcepts = concepts.filter((concept) => concept.subtopicId === subtopic.id);
        if (subtopicConcepts.length === 0) {
          throw new NotFoundError("This subtopic has no concepts to quiz on.");
        }
        return subtopicConcepts;
      }
    }
  }

  /**
   * Splits the requested question count across the candidate concepts,
   * weakest and unpractised first (repeating concepts if there are fewer
   * concepts than questions).
   */
  private planConcepts(
    topicId: string,
    candidates: readonly ConceptRow[],
    input: StartQuizInput,
  ): QuizPromptConcept[] {
    const masteries = this.progressService.masteryByConceptForTopic(topicId);
    const selectedIds = selectFocusConcepts(
      candidates.map((concept) => ({
        id: concept.id,
        position: concept.position,
        mastery: masteryFor(masteries, concept.id),
      })),
      input.questionCount,
    );

    const counts = new Map<string, number>();
    for (const conceptId of selectedIds) counts.set(conceptId, (counts.get(conceptId) ?? 0) + 1);

    return candidates
      .filter((concept) => counts.has(concept.id))
      .map((concept) => ({
        id: concept.id,
        name: concept.name,
        summary: concept.summary,
        questionCount: counts.get(concept.id) ?? 0,
      }));
  }

  private async grade(question: QuestionRow, quiz: QuizRow, answer: string): Promise<GradeResult> {
    switch (question.type) {
      case "multiple_choice": {
        // Only a plain option index is accepted, so the stored answer always matches the UI.
        const selectedIndex = /^\d+$/.test(answer) ? Number(answer) : -1;
        const optionCount = question.options?.length ?? 0;
        if (selectedIndex < 0 || selectedIndex >= optionCount) {
          throw new ValidationError("Choose one of the options.");
        }
        return gradeMultipleChoice(selectedIndex, question.correctOptionIndex ?? -1);
      }
      case "code_output":
        return (
          gradeCodeOutput(answer, question.expectedAnswer ?? "") ??
          (await this.judgeOutput(question, quiz, answer))
        );
      case "short_answer":
        return this.gradeShortAnswer(question, quiz, answer);
      case "coding_challenge":
        return this.reviewCode(question, quiz, answer);
    }
  }

  /**
   * When no exact or near-exact rule matches a code-output answer, Claude
   * judges how much of the behaviour the learner predicted. Partial credit
   * is capped below full marks: only a matching output earns 100%.
   */
  private async judgeOutput(
    question: QuestionRow,
    quiz: QuizRow,
    answer: string,
  ): Promise<GradeResult> {
    const topic = this.requireTopic(quiz.topicId);
    const judgement = await this.llm.generateStructured({
      task: "grade-code-output",
      ...buildOutputGradingPrompt({
        topicName: topic.name,
        difficulty: quiz.difficulty,
        question: question.prompt,
        code: question.code ?? "",
        language: question.codeLanguage ?? "text",
        expectedOutput: question.expectedAnswer ?? "",
        learnerOutput: answer,
      }),
      schema: outputJudgementSchema,
      effort: "low",
      quizId: quiz.id,
      conceptId: question.conceptId,
    });

    const score = Math.min(clampScore(judgement.score), MAX_JUDGED_OUTPUT_SCORE);
    return { score, isCorrect: isPassingScore(score), feedback: judgement.feedback.trim() };
  }

  /** Claude reviews the solution against the rubric; the code is never executed. */
  private async reviewCode(
    question: QuestionRow,
    quiz: QuizRow,
    answer: string,
  ): Promise<GradeResult> {
    const topic = this.requireTopic(quiz.topicId);
    const review = await this.llm.generateStructured({
      task: "review-coding-challenge",
      ...buildCodeReviewPrompt({
        topicName: topic.name,
        difficulty: quiz.difficulty,
        task: question.prompt,
        language: question.codeLanguage ?? "text",
        starterCode: question.code ?? "",
        referenceSolution: question.expectedAnswer ?? "",
        rubric: question.rubric ?? [],
        learnerSolution: answer,
      }),
      schema: codeReviewSchema,
      effort: "medium",
      quizId: quiz.id,
      conceptId: question.conceptId,
    });

    const score = clampScore(review.score);
    const feedback = [
      review.summary.trim(),
      `Correctness:\n${review.correctness.trim()}`,
      `Edge cases:\n${review.edgeCases.trim()}`,
      `Complexity:\n${review.complexity.trim()}`,
    ].join("\n\n");
    return { score, isCorrect: isPassingScore(score), feedback };
  }

  private async gradeShortAnswer(
    question: QuestionRow,
    quiz: QuizRow,
    answer: string,
  ): Promise<GradeResult> {
    const topic = this.requireTopic(quiz.topicId);
    const grade = await this.llm.generateStructured({
      task: "grade-short-answer",
      ...buildShortAnswerGradingPrompt({
        topicName: topic.name,
        difficulty: quiz.difficulty,
        question: question.prompt,
        code: question.code,
        modelAnswer: question.expectedAnswer ?? "",
        rubric: question.rubric ?? [],
        learnerAnswer: answer,
      }),
      schema: shortAnswerGradeSchema,
      effort: "low",
      quizId: quiz.id,
      conceptId: question.conceptId,
    });

    const score = clampScore(grade.score);
    const missed = grade.missedPoints.map((point) => point.trim()).filter(Boolean);
    const feedback = missed.length
      ? `${grade.feedback.trim()}\n\nWhat was missing:\n${missed.map((point) => `• ${point}`).join("\n")}`
      : grade.feedback.trim();
    return { score, isCorrect: isPassingScore(score), feedback };
  }

  private requireTopic(topicId: string): TopicRow {
    const topic = this.topicRepository.findById(topicId);
    if (!topic) throw new NotFoundError("Topic not found.");
    return topic;
  }

  private requireQuiz(quizId: string): QuizRow {
    const quiz = this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundError("Quiz not found.");
    return quiz;
  }
}

function toQuestionRow(draft: QuestionDraft, quizId: string, position: number): QuestionRow {
  return {
    id: randomUUID(),
    quizId,
    conceptId: draft.conceptId,
    position,
    type: draft.type,
    prompt: draft.prompt,
    code: draft.code,
    codeLanguage: draft.codeLanguage,
    explanation: draft.explanation,
    options: draft.type === "multiple_choice" ? draft.options : null,
    correctOptionIndex: draft.type === "multiple_choice" ? draft.correctOptionIndex : null,
    expectedAnswer: draft.type === "multiple_choice" ? null : draft.expectedAnswer,
    rubric: "rubric" in draft ? draft.rubric : null,
  };
}

function toAnswerResult(question: QuestionRow, attempt: AttemptRow): AnswerResultView {
  const correctAnswer =
    question.type === "multiple_choice"
      ? (question.options?.[question.correctOptionIndex ?? -1] ?? "")
      : (question.expectedAnswer ?? "");
  return {
    answer: attempt.answer,
    score: attempt.score,
    isCorrect: attempt.isCorrect,
    skipped: attempt.skipped,
    feedback: attempt.feedback,
    explanation: question.explanation,
    correctAnswer,
  };
}
