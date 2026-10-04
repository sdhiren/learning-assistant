import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { createTestApp, SAMPLE_SKILL_TREE } from "@/test/test-app";

describe("ReadingService", () => {
  let app: ReturnType<typeof createTestApp>;
  let topicId: string;
  let conceptId: string;

  beforeEach(async () => {
    app = createTestApp();
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    topicId = await app.topics.createTopic({ name: "Node.js", goal: "" });
    conceptId = app.topics.getTopicOverview(topicId).subtopics[0]!.concepts[0]!.id;
  });

  it("has no content until a lesson is generated", () => {
    expect(app.readings.getReading(topicId, conceptId)).toMatchObject({
      conceptName: "Event loop",
      subtopicName: "Runtime",
      content: null,
    });
  });

  it("generates, stores and later replaces the lesson", async () => {
    app.llm.respondTo("generate-reading", {
      markdown: "## Core idea\nFirst version",
      keyTakeaways: ["a", "b", "c"],
    });
    await app.readings.generateReading(topicId, conceptId);

    app.llm.respondTo("generate-reading", {
      markdown: "## Core idea\nSecond version",
      keyTakeaways: ["d", "e", "f"],
    });
    await app.readings.generateReading(topicId, conceptId);

    expect(app.readings.getReading(topicId, conceptId).content).toMatchObject({
      markdown: "## Core idea\nSecond version",
      keyTakeaways: ["d", "e", "f"],
    });
  });

  it("refuses a concept requested through a different topic", async () => {
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    const otherTopicId = await app.topics.createTopic({ name: "Deno", goal: "" });
    expect(() => app.readings.getReading(otherTopicId, conceptId)).toThrow(NotFoundError);
  });
});
