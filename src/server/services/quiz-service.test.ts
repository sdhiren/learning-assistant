import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { AiGenerationError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { QuizFocus } from "@/domain/input-schemas";
import type { GeneratedQuestion } from "@/server/ai/schemas";
import {
  codeOutputQuestion,
  createTestApp,
  multipleChoiceQuestion,
  SAMPLE_SKILL_TREE,
  shortAnswerQuestion,
} from "@/test/test-app";

describe("QuizService", () => {
  let app: ReturnType<typeof createTestApp>;
  let topicId: string;
  let conceptIds: string[];

  async function startQuiz(
    questions: GeneratedQuestion[],
    focus: QuizFocus = { kind: "weak_spots" },
  ) {
    app.llm.respondTo("generate-quiz", { questions });
    return app.quizzes.startQuiz({ topicId, difficulty: "medium", questionCount: 5, focus });
  }

  function answer(questionId: string, value: string) {
    return app.quizzes.submitAnswer({ questionId, answer: value, timeTakenMs: 1000 });
  }

  beforeEach(async () => {
    app = createTestApp();
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    topicId = await app.topics.createTopic({ name: "Node.js", goal: "" });
    conceptIds = app.topics
      .getTopicOverview(topicId)
      .subtopics.flatMap((subtopic) => subtopic.concepts.map((concept) => concept.id));
  });

  describe("startQuiz", () => {
    it("targets unpractised concepts in curriculum order by default", async () => {
      await startQuiz(conceptIds.slice(0, 5).map((id) => multipleChoiceQuestion(id)));
      const prompt = app.llm.requestsFor("generate-quiz")[0]!.prompt;
      for (const id of conceptIds.slice(0, 5)) expect(prompt).toContain(`id: ${id}`);
      expect(prompt).not.toContain(`id: ${conceptIds[5]}`);
    });

    it("puts every question on the chosen concept", async () => {
      const conceptId = conceptIds[2]!;
      await startQuiz(
        Array.from({ length: 5 }, () => multipleChoiceQuestion(conceptId)),
        { kind: "concept", id: conceptId },
      );
      expect(app.llm.requestsFor("generate-quiz")[0]!.prompt).toContain(
        `id: ${conceptId} | questions: 5`,
      );
    });

    it("rejects a concept from another topic", async () => {
      await expect(startQuiz([], { kind: "concept", id: randomUUID() })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("drops malformed questions but keeps the quiz when enough are valid", async () => {
      const valid = conceptIds.slice(0, 4).map((id) => multipleChoiceQuestion(id));
      const invalid = { ...multipleChoiceQuestion(conceptIds[0]!), options: ["only one"] };
      const quizId = await startQuiz([...valid, invalid]);
      expect(app.quizzes.getQuizSession(quizId).questions).toHaveLength(4);
    });

    it("fails when Claude returns too few usable questions", async () => {
      const outsideConcept = multipleChoiceQuestion(randomUUID());
      await expect(startQuiz([outsideConcept, outsideConcept])).rejects.toBeInstanceOf(
        AiGenerationError,
      );
    });

    it("marks the topic as studied", async () => {
      await startQuiz(conceptIds.slice(0, 5).map((id) => multipleChoiceQuestion(id)));
      expect(app.topics.listTopics()[0]!.lastStudiedAt).toBeInstanceOf(Date);
    });
  });

  describe("getQuizSession", () => {
    it("never exposes answer keys for unanswered questions", async () => {
      const quizId = await startQuiz([
        multipleChoiceQuestion(conceptIds[0]!),
        codeOutputQuestion(conceptIds[1]!),
        shortAnswerQuestion(conceptIds[2]!),
      ]);
      const serialized = JSON.stringify(app.quizzes.getQuizSession(quizId));
      expect(serialized).not.toContain("correctOptionIndex");
      expect(serialized).not.toContain("Microtasks run before timers");
      expect(serialized).not.toContain("Slowing producers");
      expect(serialized).not.toContain("rubric");
    });
  });

  describe("submitAnswer", () => {
    it("grades multiple choice locally and reveals the answer afterwards", async () => {
      const quizId = await startQuiz(
        conceptIds.slice(0, 5).map((id) => multipleChoiceQuestion(id)),
      );
      const [first] = app.quizzes.getQuizSession(quizId).questions;

      const { result, quizCompleted } = await answer(first!.id, "1");

      expect(result).toMatchObject({ isCorrect: true, correctAnswer: "Promise.then" });
      expect(quizCompleted).toBe(false);
      expect(app.llm.requestsFor("grade-short-answer")).toHaveLength(0);
    });

    it("rejects an option index that doesn't exist", async () => {
      const quizId = await startQuiz(
        conceptIds.slice(0, 5).map((id) => multipleChoiceQuestion(id)),
      );
      const [first] = app.quizzes.getQuizSession(quizId).questions;
      await expect(answer(first!.id, "7")).rejects.toBeInstanceOf(ValidationError);
    });

    it.each(["1e0", "0x1", " 1", "1.0"])("rejects the loosely formatted option %j", async (raw) => {
      const quizId = await startQuiz(
        conceptIds.slice(0, 5).map((id) => multipleChoiceQuestion(id)),
      );
      const [first] = app.quizzes.getQuizSession(quizId).questions;
      await expect(answer(first!.id, raw)).rejects.toBeInstanceOf(ValidationError);
    });

    it("grades code output by comparing against the expected output", async () => {
      const quizId = await startQuiz(conceptIds.slice(0, 3).map((id) => codeOutputQuestion(id)));
      const [first, second] = app.quizzes.getQuizSession(quizId).questions;
      expect((await answer(first!.id, "2\n")).result.isCorrect).toBe(true);
      expect((await answer(second!.id, "11")).result.isCorrect).toBe(false);
    });

    it("grades short answers with Claude and passes the answer as tagged data", async () => {
      app.llm.respondTo("grade-short-answer", {
        score: 0.75,
        feedback: "Good start.",
        missedPoints: ["Buffering limits"],
      });
      const quizId = await startQuiz(conceptIds.slice(0, 3).map((id) => shortAnswerQuestion(id)));
      const [first] = app.quizzes.getQuizSession(quizId).questions;

      const { result } = await answer(first!.id, "Producers go faster than consumers");

      expect(result).toMatchObject({ score: 0.75, isCorrect: true });
      expect(result.feedback).toContain("Buffering limits");
      expect(app.llm.requestsFor("grade-short-answer")[0]!.prompt).toContain(
        "<learner_answer>\nProducers go faster than consumers\n</learner_answer>",
      );
    });

    it("refuses to grade the same question twice", async () => {
      const quizId = await startQuiz(
        conceptIds.slice(0, 5).map((id) => multipleChoiceQuestion(id)),
      );
      const [first] = app.quizzes.getQuizSession(quizId).questions;
      await answer(first!.id, "1");
      await expect(answer(first!.id, "0")).rejects.toBeInstanceOf(ConflictError);
    });

    it("completes the quiz with the mean score and updates mastery", async () => {
      const quizId = await startQuiz(
        conceptIds.slice(0, 4).map((id) => multipleChoiceQuestion(id)),
      );
      const questions = app.quizzes.getQuizSession(quizId).questions;

      const outcomes = [];
      for (const [index, question] of questions.entries()) {
        outcomes.push(await answer(question.id, index < 3 ? "1" : "0"));
      }

      expect(outcomes.at(-1)!.quizCompleted).toBe(true);
      expect(app.quizzes.getQuizSession(quizId)).toMatchObject({
        status: "completed",
        score: 0.75,
      });
      const overview = app.topics.getTopicOverview(topicId);
      expect(overview.stats).toMatchObject({
        completedQuizCount: 1,
        answeredQuestionCount: 4,
        accuracy: 0.75,
        recentScores: [0.75],
      });
      expect(overview.inProgressQuizId).toBeNull();
      expect(overview.progress).toBeGreaterThan(0);
    });

    it("rejects answers to a finished quiz", async () => {
      const quizId = await startQuiz(
        conceptIds.slice(0, 3).map((id) => multipleChoiceQuestion(id)),
      );
      const questions = app.quizzes.getQuizSession(quizId).questions;
      for (const question of questions) await answer(question.id, "1");
      await expect(answer(questions[0]!.id, "1")).rejects.toBeInstanceOf(ConflictError);
    });

    it("reports unknown questions as not found", async () => {
      await expect(answer(randomUUID(), "1")).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
