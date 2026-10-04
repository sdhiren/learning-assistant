import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ConflictError, NotFoundError } from "@/lib/errors";
import { createTestApp, multipleChoiceQuestion, SAMPLE_SKILL_TREE } from "@/test/test-app";

const NEW_SUBTOPIC = {
  name: "Event Loop Phases",
  concepts: [
    { name: "Timers phase", summary: "When setTimeout callbacks run." },
    { name: "Check phase", summary: "Where setImmediate runs." },
    { name: "process.nextTick queue", summary: "Runs before other microtasks." },
  ],
};

describe("SubtopicService", () => {
  let app: ReturnType<typeof createTestApp>;
  let topicId: string;

  beforeEach(async () => {
    app = createTestApp();
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    app.llm.respondTo("generate-subtopic", NEW_SUBTOPIC);
    topicId = await app.topics.createTopic({ name: "Node.js", goal: "Backend role" });
  });

  describe("addSubtopic", () => {
    it("appends the subtopic and its concepts to the end of the skill map", async () => {
      const subtopicId = await app.subtopics.addSubtopic({
        topicId,
        name: "event loop phases",
        notes: "libuv",
      });

      const subtopics = app.topics.getTopicOverview(topicId).subtopics;
      expect(subtopics.map((subtopic) => subtopic.name)).toEqual([
        "Runtime",
        "Modules",
        "Performance",
        "Event Loop Phases",
      ]);
      expect(subtopics.at(-1)).toMatchObject({ id: subtopicId, origin: "learner", progress: 0 });
      expect(subtopics.at(-1)!.concepts.map((concept) => concept.name)).toEqual([
        "Timers phase",
        "Check phase",
        "process.nextTick queue",
      ]);
      expect(app.topics.listTopics()[0]!.conceptCount).toBe(9);
    });

    it("gives Claude the existing skill map and the learner's input as tagged data", async () => {
      await app.subtopics.addSubtopic({ topicId, name: "Event loop phases", notes: "libuv" });
      const prompt = app.llm.requestsFor("generate-subtopic")[0]!.prompt;
      expect(prompt).toContain("- Runtime: Event loop; Microtasks");
      expect(prompt).toContain("<new_subtopic>\nEvent loop phases\n</new_subtopic>");
      expect(prompt).toContain("<learner_notes>\nlibuv\n</learner_notes>");
    });

    it("rejects a name that matches an existing subtopic without calling Claude", async () => {
      await expect(
        app.subtopics.addSubtopic({ topicId, name: "  RUNTIME ", notes: "" }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(app.llm.requestsFor("generate-subtopic")).toHaveLength(0);
    });

    it("rejects a name Claude normalises into an existing subtopic", async () => {
      app.llm.respondTo("generate-subtopic", { ...NEW_SUBTOPIC, name: "Modules" });
      await expect(
        app.subtopics.addSubtopic({ topicId, name: "module system", notes: "" }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects unknown topics", async () => {
      await expect(
        app.subtopics.addSubtopic({ topicId: randomUUID(), name: "Streams", notes: "" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("getSubtopic", () => {
    it("returns the subtopic with its concepts", async () => {
      const subtopicId = await app.subtopics.addSubtopic({ topicId, name: "Phases", notes: "" });
      expect(app.subtopics.getSubtopic(topicId, subtopicId)).toMatchObject({
        name: "Event Loop Phases",
        topicName: "Node.js",
        origin: "learner",
      });
    });

    it("refuses a subtopic requested through a different topic", async () => {
      const subtopicId = await app.subtopics.addSubtopic({ topicId, name: "Phases", notes: "" });
      const otherTopicId = await app.topics.createTopic({ name: "Deno", goal: "" });
      expect(() => app.subtopics.getSubtopic(otherTopicId, subtopicId)).toThrow(NotFoundError);
    });
  });

  describe("quizzing a subtopic", () => {
    it("only asks about the subtopic's concepts and labels the quiz with it", async () => {
      const subtopicId = await app.subtopics.addSubtopic({ topicId, name: "Phases", notes: "" });
      const subtopicConceptIds = app.subtopics
        .getSubtopic(topicId, subtopicId)
        .concepts.map((concept) => concept.id);
      const otherConceptIds = app.topics
        .getTopicOverview(topicId)
        .subtopics[0]!.concepts.map((concept) => concept.id);

      app.llm.respondTo("generate-quiz", {
        questions: [
          ...subtopicConceptIds.map((id) => multipleChoiceQuestion(id)),
          ...subtopicConceptIds.slice(0, 2).map((id) => multipleChoiceQuestion(id, "Another?")),
          // Off-focus questions must be dropped.
          multipleChoiceQuestion(otherConceptIds[0]!),
        ],
      });
      const quizId = await app.quizzes.startQuiz({
        topicId,
        difficulty: "medium",
        questionCount: 5,
        focus: { kind: "subtopic", id: subtopicId },
      });

      const prompt = app.llm.requestsFor("generate-quiz")[0]!.prompt;
      for (const id of subtopicConceptIds) expect(prompt).toContain(`id: ${id}`);
      for (const id of otherConceptIds) expect(prompt).not.toContain(`id: ${id}`);

      const session = app.quizzes.getQuizSession(quizId);
      expect(session.focusLabel).toBe("Event Loop Phases");
      expect(session.questions).toHaveLength(5);
      expect(
        session.questions.every((question) =>
          ["Timers phase", "Check phase", "process.nextTick queue"].includes(question.conceptName),
        ),
      ).toBe(true);
      expect(app.topics.getTopicOverview(topicId).recentQuizzes[0]!.focusLabel).toBe(
        "Event Loop Phases",
      );
    });

    it("rejects a subtopic from another topic", async () => {
      const otherTopicId = await app.topics.createTopic({ name: "Deno", goal: "" });
      const foreignSubtopicId = app.topics.getTopicOverview(otherTopicId).subtopics[0]!.id;
      await expect(
        app.quizzes.startQuiz({
          topicId,
          difficulty: "easy",
          questionCount: 5,
          focus: { kind: "subtopic", id: foreignSubtopicId },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
