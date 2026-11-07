import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { askClarificationInput, MAX_CLARIFICATIONS_PER_QUESTION } from "@/domain/input-schemas";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { GeneratedQuestion } from "@/server/ai/schemas";
import { attempts, clarifications } from "@/server/db/schema";
import {
  codingChallengeQuestion,
  createTestApp,
  multipleChoiceQuestion,
  SAMPLE_SKILL_TREE,
  shortAnswerQuestion,
} from "@/test/test-app";

/** Text from the answer keys of the sample questions; none of it may reach a pre-answer prompt. */
const ANSWER_KEY_TEXT = [
  "Slowing producers when consumers can't keep up.",
  "Producer/consumer speed mismatch",
  "Buffering limits",
  "Streams pause when the buffer is full.",
  "Microtasks run before timers.",
  "nums.filter",
  "Returns the correct sum",
  "Filter the even numbers",
];
const KEY_TAGS = [
  "model_answer",
  "rubric",
  "explanation",
  "learner_answer",
  "grading_feedback",
  "reference_solution",
];

describe("ClarificationService", () => {
  let app: ReturnType<typeof createTestApp>;
  let topicId: string;
  let conceptIds: string[];

  async function startQuiz(questions: GeneratedQuestion[]) {
    app.llm.respondTo("generate-quiz", { questions });
    const quizId = await app.quizzes.startQuiz({
      topicId,
      difficulty: "medium",
      questionCount: questions.length,
      focus: { kind: "weak_spots" },
      instructions: "",
    });
    return { quizId, questions: app.quizzes.getQuizSession(quizId).questions };
  }

  /** Validates like the server action does. */
  function ask(questionId: string, message: string) {
    return app.clarifications.ask(askClarificationInput.parse({ questionId, message }));
  }

  function answer(questionId: string, value: string) {
    return app.quizzes.submitAnswer({ questionId, answer: value, timeTakenMs: 1000 });
  }

  /** Every prompt sent for clarifications, system prompt included. */
  function sentText(task: string, index = 0) {
    const request = app.llm.requestsFor(task)[index]!;
    return `${request.systemPrompt}\n${request.prompt}`;
  }

  beforeEach(async () => {
    app = createTestApp();
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    topicId = await app.topics.createTopic({ name: "Node.js", goal: "" });
    conceptIds = app.topics
      .getTopicOverview(topicId)
      .subtopics.flatMap((subtopic) => subtopic.concepts.map((concept) => concept.id));
    app.llm.respondTo("clarify-question", { reply: "It means agree on it up front." });
    app.llm.respondTo("discuss-answer", { reply: "Because a ledger can't lose writes." });
    app.llm.respondTo("grade-short-answer", {
      score: 0.45,
      feedback: "You missed the numbers.",
      missedPoints: [],
    });
    app.llm.respondTo("review-coding-challenge", {
      score: 0.8,
      summary: "Works.",
      correctness: "Correct.",
      edgeCases: "Empty input handled.",
      complexity: "O(n).",
    });
  });

  describe("before answering", () => {
    it("sends only what the learner sees, never the answer key", async () => {
      const { questions } = await startQuiz([
        shortAnswerQuestion(conceptIds[0]!),
        multipleChoiceQuestion(conceptIds[1]!),
        codingChallengeQuestion(conceptIds[2]!),
      ]);
      for (const question of questions) await ask(question.id, "What does this mean?");

      const requests = app.llm.requestsFor("clarify-question");
      expect(requests).toHaveLength(3);
      for (const [index, request] of requests.entries()) {
        const text = sentText("clarify-question", index);
        for (const secret of ANSWER_KEY_TEXT) expect(text).not.toContain(secret);
        // The system prompt names <learner_answer> in its data-handling rule.
        for (const tag of KEY_TAGS) expect(request.prompt).not.toContain(`<${tag}>`);
        expect(text).toContain("<learner_question>\nWhat does this mean?\n</learner_question>");
      }

      expect(sentText("clarify-question", 0)).toContain("<question>\nExplain backpressure.");
      expect(sentText("clarify-question", 0)).toContain("<concept>\nEvent loop\n</concept>");
      expect(sentText("clarify-question", 1)).toContain(
        "<options>\nA. setTimeout\nB. Promise.then\nC. setImmediate\nD. process.exit\n</options>",
      );
      expect(sentText("clarify-question", 2)).toContain(
        "<code>\nfunction sumEven(nums) {\n  // TODO\n}\n</code>",
      );
    });

    it("never sends an answer draft, even if the client includes one", async () => {
      const { questions } = await startQuiz([shortAnswerQuestion(conceptIds[0]!)]);
      const input = askClarificationInput.parse({
        questionId: questions[0]!.id,
        message: "Is this right?",
        answer: "My unsent draft",
      });
      await app.clarifications.ask(input);
      expect(sentText("clarify-question")).not.toContain("My unsent draft");
    });

    it("tells the model not to give the answer away", async () => {
      const { questions } = await startQuiz([multipleChoiceQuestion(conceptIds[0]!)]);
      await ask(questions[0]!.id, "Which one is it?");
      const text = sentText("clarify-question");
      expect(text).toContain("never say which option is right or wrong");
      expect(text).toContain("decline in one");
    });

    it("stores both messages as before_answer, with usage tagged by quiz and concept", async () => {
      const { quizId, questions } = await startQuiz([shortAnswerQuestion(conceptIds[0]!)]);
      const thread = await ask(questions[0]!.id, "  What does pin down mean?  ");

      expect(thread.map(({ role, stage, content }) => ({ role, stage, content }))).toEqual([
        { role: "learner", stage: "before_answer", content: "What does pin down mean?" },
        { role: "assistant", stage: "before_answer", content: "It means agree on it up front." },
      ]);
      expect(app.quizzes.getQuizSession(quizId).questions[0]!.clarifications).toEqual(thread);
      expect(app.llmCalls().filter((call) => call.task === "clarify-question")).toEqual([
        expect.objectContaining({ outcome: "ok", quizId, conceptId: conceptIds[0] }),
      ]);
    });

    it("carries no penalty: the score matches answering without asking", async () => {
      const { questions } = await startQuiz([
        shortAnswerQuestion(conceptIds[0]!),
        shortAnswerQuestion(conceptIds[1]!),
      ]);
      const [asked, plain] = questions;
      await ask(asked!.id, "How detailed should my answer be?");
      await ask(asked!.id, "Should I give numbers?");

      const withClarifications = await answer(asked!.id, "Buffers fill up.");
      const without = await answer(plain!.id, "Buffers fill up.");
      expect(withClarifications.result.score).toBe(without.result.score);
      expect(withClarifications.result.isCorrect).toBe(without.result.isCorrect);
      expect(withClarifications.result.feedback).toBe(without.result.feedback);
      // Grading never sees the clarification thread.
      expect(app.llm.requestsFor("grade-short-answer")[0]!.prompt).not.toContain("numbers?");
    });
  });

  describe("after answering", () => {
    it("discusses the full answer, with earlier turns in order", async () => {
      const { quizId, questions } = await startQuiz([shortAnswerQuestion(conceptIds[0]!)]);
      const questionId = questions[0]!.id;
      await ask(questionId, "What does pin down mean?");
      await answer(questionId, "Producers and consumers.");
      const thread = await ask(questionId, "Why only 45%?");

      expect(thread.map((message) => message.stage)).toEqual(["after_answer", "after_answer"]);
      const text = sentText("discuss-answer");
      expect(text).toContain(
        "<model_answer>\nSlowing producers when consumers can't keep up.\n</model_answer>",
      );
      expect(text).toContain(
        "<rubric>\n- Producer/consumer speed mismatch\n- Buffering limits\n</rubric>",
      );
      expect(text).toContain(
        "<explanation>\nStreams pause when the buffer is full.\n</explanation>",
      );
      expect(text).toContain("<learner_answer>\nProducers and consumers.\n</learner_answer>");
      expect(text).toContain("Score given: 45%.");
      expect(text).toContain("<grading_feedback>\nYou missed the numbers.");
      expect(text).toContain(
        "<conversation>\nLearner: What does pin down mean?\n\nYou: It means agree on it up front.\n</conversation>",
      );
      expect(text).toContain("<learner_question>\nWhy only 45%?\n</learner_question>");

      const stored = app.quizzes.getQuizSession(quizId).questions[0]!.clarifications;
      expect(stored.map((message) => [message.role, message.stage])).toEqual([
        ["learner", "before_answer"],
        ["assistant", "before_answer"],
        ["learner", "after_answer"],
        ["assistant", "after_answer"],
      ]);
      expect(app.llmCalls().filter((call) => call.task === "discuss-answer")).toEqual([
        expect.objectContaining({ outcome: "ok", quizId, conceptId: conceptIds[0] }),
      ]);
    });

    it("names the chosen and correct options for multiple choice", async () => {
      const { questions } = await startQuiz([multipleChoiceQuestion(conceptIds[0]!)]);
      await answer(questions[0]!.id, "0");
      await ask(questions[0]!.id, "Why not setTimeout?");
      const text = sentText("discuss-answer");
      expect(text).toContain("<model_answer>\nB. Promise.then\n</model_answer>");
      expect(text).toContain("<learner_answer>\nA. setTimeout\n</learner_answer>");
    });

    it("discusses skipped questions on a finished quiz", async () => {
      const { quizId, questions } = await startQuiz([
        shortAnswerQuestion(conceptIds[0]!),
        shortAnswerQuestion(conceptIds[1]!),
      ]);
      app.quizzes.finishQuiz(quizId);
      await ask(questions[1]!.id, "What was the answer?");

      const text = sentText("discuss-answer");
      expect(text).toContain("The learner skipped this question without answering.");
      expect(text).toContain("<model_answer>");
      expect(app.llm.requestsFor("discuss-answer")[0]!.prompt).not.toContain("<learner_answer>");
      expect(app.quizzes.getQuizSession(quizId).status).toBe("completed");
    });

    it("never changes the stored score", async () => {
      const { quizId, questions } = await startQuiz([shortAnswerQuestion(conceptIds[0]!)]);
      await answer(questions[0]!.id, "Buffers.");
      const before = app.db.select().from(attempts).all();
      const quizScore = app.quizzes.getQuizSession(quizId).score;

      app.llm.respondTo("discuss-answer", { reply: "You're right, the grade looks too low." });
      await ask(questions[0]!.id, "I think my grade is wrong.");

      expect(app.db.select().from(attempts).all()).toEqual(before);
      expect(app.quizzes.getQuizSession(quizId).score).toBe(quizScore);
    });
  });

  it("stores nothing when the AI call fails", async () => {
    const { questions } = await startQuiz([shortAnswerQuestion(conceptIds[0]!)]);
    app.llm.failWith("clarify-question", "timeout");

    await expect(ask(questions[0]!.id, "Hello?")).rejects.toThrow();
    expect(app.db.select().from(clarifications).all()).toEqual([]);
    expect(app.llmCalls().filter((call) => call.task === "clarify-question")).toEqual([
      expect.objectContaining({ outcome: "timeout" }),
    ]);
  });

  it("shares the message limit across both stages", async () => {
    const { questions } = await startQuiz([shortAnswerQuestion(conceptIds[0]!)]);
    const questionId = questions[0]!.id;
    for (let i = 0; i < MAX_CLARIFICATIONS_PER_QUESTION - 1; i++) await ask(questionId, `Q${i}`);
    await answer(questionId, "Buffers.");
    await ask(questionId, "One more after answering");

    await expect(ask(questionId, "Too many")).rejects.toThrow(ValidationError);
    expect(app.llm.requests.filter((r) => r.task !== "generate-quiz")).toHaveLength(
      MAX_CLARIFICATIONS_PER_QUESTION + 1 + 1, // + the skill tree + the grading call
    );
    // Only the most recent turns are sent as history.
    const last = app.llm.requestsFor("discuss-answer")[0]!.prompt;
    expect(last).not.toContain("Learner: Q0\n");
    expect(last).toContain("Learner: Q8");
  });

  it("reports unknown questions as not found", async () => {
    await expect(ask(randomUUID(), "Hello?")).rejects.toThrow(NotFoundError);
  });

  it("deletes threads with their topic", async () => {
    const { questions } = await startQuiz([shortAnswerQuestion(conceptIds[0]!)]);
    await ask(questions[0]!.id, "What does this mean?");
    expect(app.db.select().from(clarifications).all()).toHaveLength(2);

    app.topics.deleteTopic(topicId);
    expect(app.db.select().from(clarifications).all()).toEqual([]);
  });
});
