import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { runWithRequestContext } from "@/server/request-context";
import { createTestApp, SAMPLE_SKILL_TREE, shortAnswerQuestion } from "@/test/test-app";

/** Every AI call through the instrumented client writes exactly one `llm_calls` row. */
describe("AI call usage records", () => {
  let app: ReturnType<typeof createTestApp>;
  let consoleSpies: MockInstance[];

  beforeEach(() => {
    app = createTestApp();
    consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
  });

  async function flow({
    name = "Node.js",
    goal = "",
    instructions = "",
    learnerAnswer = "Producers go faster than consumers",
  } = {}) {
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE, {
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    const topicId = await app.topics.createTopic({ name, goal });
    const conceptIds = app.topics
      .getTopicOverview(topicId)
      .subtopics.flatMap((subtopic) => subtopic.concepts.map((concept) => concept.id));

    app.llm.respondTo("generate-quiz", {
      questions: conceptIds.slice(0, 3).map((id) => shortAnswerQuestion(id)),
    });
    const quizId = await app.quizzes.startQuiz({
      topicId,
      difficulty: "medium",
      questionCount: 3,
      focus: { kind: "weak_spots" },
      instructions,
    });
    const [first, second] = app.quizzes.getQuizSession(quizId).questions;

    app.llm.respondTo("grade-short-answer", {
      score: 0.75,
      feedback: "Good start.",
      missedPoints: [],
    });
    await app.quizzes.submitAnswer({
      questionId: first!.id,
      answer: learnerAnswer,
      timeTakenMs: 1,
    });

    app.llm.respondTo("generate-reading", {
      markdown: "## Core idea\nText",
      keyTakeaways: ["a", "b", "c"],
    });
    await app.readings.generateReading({ topicId, conceptId: conceptIds[0]!, instructions });

    return { topicId, quizId, conceptIds, first: first!, second: second! };
  }

  it("records one row per call with task, provider, model, outcome and ids", async () => {
    const { quizId, conceptIds, first } = await flow();

    const rows = app.llmCalls();
    expect(rows.map((row) => row.task)).toEqual([
      "generate-skill-tree",
      "generate-quiz",
      "grade-short-answer",
      "generate-reading",
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        provider: "claude-code",
        model: "claude-opus-5-5",
        outcome: "ok",
      });
      expect(row.id).toEqual(expect.any(String));
      expect(row.startedAt).toBeInstanceOf(Date);
      expect(row.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(rows[0]).toMatchObject({ inputTokens: 1000, outputTokens: 200, quizId: null });
    expect(rows[1]).toMatchObject({ inputTokens: null, quizId: null, conceptId: null });
    expect(rows[2]).toMatchObject({ quizId, conceptId: first.conceptId });
    expect(rows[3]).toMatchObject({ quizId: null, conceptId: conceptIds[0] });
  });

  it("records a failed grading call with its outcome", async () => {
    const { second } = await flow();
    app.llm.failWith("grade-short-answer", "timeout");

    await expect(
      app.quizzes.submitAnswer({ questionId: second.id, answer: "anything", timeTakenMs: 1 }),
    ).rejects.toThrow();

    const rows = app.llmCalls().filter((row) => row.task === "grade-short-answer");
    expect(rows.map((row) => row.outcome)).toEqual(["ok", "timeout"]);
  });

  it("keeps usage rows when the topic is deleted", async () => {
    const { topicId } = await flow();

    app.topics.deleteTopic(topicId);

    expect(app.llmCalls()).toHaveLength(4);
  });

  it("stores the action's requestId on the row", async () => {
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    await runWithRequestContext("createTopic", () =>
      app.topics.createTopic({ name: "Node.js", goal: "" }),
    );

    const [row] = app.llmCalls();
    const logged = vi
      .mocked(console.info)
      .mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
      .find((line) => line.msg === "llm.call");
    expect(row!.requestId).toEqual(expect.any(String));
    expect(logged).toMatchObject({ requestId: row!.requestId, action: "createTopic" });
  });

  it("never stores or logs topic names, goals, instructions, answers or keys", async () => {
    const fakeKey = "sk-ant-api03-PRIVACYSENTINELKEY-0000";
    vi.stubEnv("ANTHROPIC_API_KEY", fakeKey);
    const sentinels = [
      "SENTINEL-TOPIC-NAME",
      "SENTINEL-GOAL",
      "SENTINEL-INSTRUCTIONS",
      "SENTINEL-LEARNER-ANSWER",
      fakeKey,
    ];

    const { second } = await runWithRequestContext("flow", () =>
      flow({
        name: "SENTINEL-TOPIC-NAME",
        goal: "SENTINEL-GOAL",
        instructions: "SENTINEL-INSTRUCTIONS",
        learnerAnswer: "SENTINEL-LEARNER-ANSWER",
      }),
    );
    app.llm.failWith("grade-short-answer", "bad_output");
    await runWithRequestContext("submitAnswer", () =>
      app.quizzes.submitAnswer({
        questionId: second.id,
        answer: "SENTINEL-LEARNER-ANSWER",
        timeTakenMs: 1,
      }),
    ).catch(() => undefined);

    // The sentinels did reach the model, so their absence below is meaningful.
    expect(JSON.stringify(app.llm.requests.map((request) => request.prompt))).toContain(
      "SENTINEL-LEARNER-ANSWER",
    );
    const stored = JSON.stringify(app.llmCalls());
    const logged = consoleSpies.flatMap((spy) => spy.mock.calls.flat().map(String)).join("\n");
    expect(logged).toContain("llm.call");
    for (const sentinel of sentinels) {
      expect(stored).not.toContain(sentinel);
      expect(logged).not.toContain(sentinel);
    }
    vi.unstubAllEnvs();
  });

  it("aggregates the recorded calls for the Usage page", async () => {
    await flow();

    const usage = app.usage.getUsage();
    expect(usage.tasks.map((task) => [task.task, task.calls, task.failureCount])).toContainEqual([
      "generate-skill-tree",
      1,
      0,
    ]);
    expect(usage.providers).toEqual([
      expect.objectContaining({
        provider: "claude-code",
        providerName: "Claude subscription",
        isSubscription: true,
        calls: 4,
        inputTokens: 1000,
        outputTokens: 200,
      }),
    ]);
  });
});
