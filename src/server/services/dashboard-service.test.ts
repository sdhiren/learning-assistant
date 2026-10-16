import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, multipleChoiceQuestion, SAMPLE_SKILL_TREE } from "@/test/test-app";

describe("DashboardService", () => {
  let app: ReturnType<typeof createTestApp>;
  let topicId: string;
  let conceptIds: string[];

  beforeEach(async () => {
    app = createTestApp();
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    topicId = await app.topics.createTopic({ name: "Node.js", goal: "" });
    conceptIds = app.topics
      .getTopicOverview(topicId)
      .subtopics.flatMap((subtopic) => subtopic.concepts.map((concept) => concept.id));
  });

  async function startQuiz(questionCount: number) {
    app.llm.respondTo("generate-quiz", {
      questions: conceptIds.slice(0, questionCount).map((id) => multipleChoiceQuestion(id)),
    });
    return app.quizzes.startQuiz({
      topicId,
      difficulty: "medium",
      questionCount: 5,
      focus: { kind: "weak_spots" },
    });
  }

  it("is empty before any practice", () => {
    const dashboard = app.dashboard.getDashboard();
    expect(dashboard).toMatchObject({
      accuracy: null,
      conceptCount: conceptIds.length,
      strongConceptCount: 0,
      inProgressQuizzes: [],
      activity: { currentStreak: 0, practisedToday: false, answeredLast7Days: 0 },
    });
    expect(dashboard.activity.days).toHaveLength(84);
  });

  it("recommends the first new concept of each topic", () => {
    const [recommendation] = app.dashboard.getDashboard().recommendations;
    expect(recommendation).toMatchObject({ topicId, concept: { id: conceptIds[0] } });
  });

  it("tracks in-progress quizzes, accuracy and today's activity", async () => {
    const quizId = await startQuiz(5);
    const [first, second] = app.quizzes.getQuizSession(quizId).questions;
    await app.quizzes.submitAnswer({ questionId: first!.id, answer: "1", timeTakenMs: 1000 });
    await app.quizzes.submitAnswer({ questionId: second!.id, answer: "0", timeTakenMs: 1000 });

    const dashboard = app.dashboard.getDashboard();
    expect(dashboard.inProgressQuizzes).toEqual([
      expect.objectContaining({
        id: quizId,
        topicName: "Node.js",
        answeredCount: 2,
        questionCount: 5,
      }),
    ]);
    expect(dashboard.accuracy).toBe(0.5);
    expect(dashboard.activity).toMatchObject({ currentStreak: 1, practisedToday: true });
    // The concept answered wrongly is now the most urgent one.
    expect(dashboard.recommendations[0]?.concept.id).toBe(conceptIds[1]);
  });
});
