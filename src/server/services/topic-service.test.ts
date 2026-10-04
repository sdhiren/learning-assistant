import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ConflictError, NotFoundError } from "@/lib/errors";
import { createTestApp, multipleChoiceQuestion, SAMPLE_SKILL_TREE } from "@/test/test-app";

describe("TopicService", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
  });

  it("creates a topic with its skill tree in curriculum order", async () => {
    const topicId = await app.topics.createTopic({ name: "Node.js", goal: "Senior backend" });
    const overview = app.topics.getTopicOverview(topicId);

    expect(overview).toMatchObject({ name: "Node.js", goal: "Senior backend", progress: 0 });
    expect(overview.subtopics.map((subtopic) => subtopic.name)).toEqual([
      "Runtime",
      "Modules",
      "Performance",
    ]);
    expect(overview.subtopics[0]!.concepts.map((concept) => concept.name)).toEqual([
      "Event loop",
      "Microtasks",
    ]);
    expect(overview.focusAreas).toHaveLength(3);
  });

  it("passes the learner's input to Claude as tagged data", async () => {
    await app.topics.createTopic({ name: "Node.js", goal: "Senior backend" });
    const [request] = app.llm.requestsFor("generate-skill-tree");
    expect(request?.prompt).toContain("<topic>\nNode.js\n</topic>");
    expect(request?.prompt).toContain("<learner_goal>\nSenior backend\n</learner_goal>");
  });

  it("rejects duplicate topic names regardless of case and spacing", async () => {
    await app.topics.createTopic({ name: "Node.js", goal: "" });
    await expect(app.topics.createTopic({ name: "  node.JS ", goal: "" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(app.llm.requestsFor("generate-skill-tree")).toHaveLength(1);
  });

  it("lists topics with their progress", async () => {
    await app.topics.createTopic({ name: "Node.js", goal: "" });
    expect(app.topics.listTopics()).toMatchObject([
      { name: "Node.js", conceptCount: 6, progress: 0, lastStudiedAt: null },
    ]);
  });

  it("deletes a topic together with its quizzes", async () => {
    const topicId = await app.topics.createTopic({ name: "Node.js", goal: "" });
    const conceptId = app.topics.getTopicOverview(topicId).subtopics[0]!.concepts[0]!.id;
    app.llm.respondTo("generate-quiz", {
      questions: Array.from({ length: 5 }, () => multipleChoiceQuestion(conceptId)),
    });
    const quizId = await app.quizzes.startQuiz({
      topicId,
      difficulty: "easy",
      questionCount: 5,
      focus: { kind: "concept", id: conceptId },
    });

    app.topics.deleteTopic(topicId);

    expect(app.topics.listTopics()).toEqual([]);
    expect(() => app.quizzes.getQuizSession(quizId)).toThrow(NotFoundError);
  });

  it("reports unknown topics as not found", () => {
    expect(() => app.topics.getTopicOverview(randomUUID())).toThrow(NotFoundError);
    expect(() => app.topics.deleteTopic(randomUUID())).toThrow(NotFoundError);
  });
});
