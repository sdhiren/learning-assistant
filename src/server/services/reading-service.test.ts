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
    await app.readings.generateReading({ topicId, conceptId: conceptId, instructions: "" });

    app.llm.respondTo("generate-reading", {
      markdown: "## Core idea\nSecond version",
      keyTakeaways: ["d", "e", "f"],
    });
    await app.readings.generateReading({ topicId, conceptId: conceptId, instructions: "" });

    expect(app.readings.getReading(topicId, conceptId).content).toMatchObject({
      markdown: "## Core idea\nSecond version",
      keyTakeaways: ["d", "e", "f"],
    });
  });

  it("rewrites a lesson with learner instructions and remembers them", async () => {
    app.llm.respondTo("generate-reading", {
      markdown: "## The big idea\nFirst",
      keyTakeaways: ["a", "b", "c"],
    });
    await app.readings.generateReading({ topicId, conceptId, instructions: "" });
    app.llm.respondTo("generate-reading", {
      markdown: "## The big idea\nWith an analogy",
      keyTakeaways: ["a", "b", "c"],
    });
    await app.readings.generateReading({
      topicId,
      conceptId,
      instructions: "Use a restaurant analogy",
    });

    const [first, second] = app.llm.requestsFor("generate-reading");
    expect(first!.prompt).not.toContain("learner_instructions");
    expect(second!.prompt).toContain(
      "<learner_instructions>\nUse a restaurant analogy\n</learner_instructions>",
    );
    expect(second!.prompt.indexOf("<learner_instructions>")).toBeGreaterThan(
      second!.prompt.indexOf("Structure (use these ## headings"),
    );
    expect(app.readings.getReading(topicId, conceptId).content).toMatchObject({
      markdown: "## The big idea\nWith an analogy",
      instructions: "Use a restaurant analogy",
    });
  });

  it("asks for a simple, example-rich lesson that connects prerequisites and related concepts", async () => {
    // "ES modules" is in the second subtopic; "CommonJS" is its sibling, and the
    // two "Runtime" concepts precede it in the curriculum.
    const target = app.topics.getTopicOverview(topicId).subtopics[1]!.concepts[1]!;
    app.llm.respondTo("generate-reading", {
      markdown: "## The big idea\nText",
      keyTakeaways: ["a", "b", "c"],
    });

    await app.readings.generateReading({ topicId, conceptId: target.id, instructions: "" });

    const request = app.llm.requestsFor("generate-reading")[0]!;
    expect(request.prompt).toContain("<concept>\nES modules: import semantics.\n</concept>");
    expect(request.prompt).toContain("<subtopic>\nModules\n</subtopic>");
    expect(request.prompt).toMatch(
      /<builds_on>[\s\S]*- Event loop[\s\S]*- CommonJS[\s\S]*<\/builds_on>/,
    );
    // CommonJS is already a prerequisite, so it isn't repeated as a related concept.
    expect(request.prompt).not.toContain("<related_concepts>\n");
    expect(request.prompt).toContain("very simple, everyday language");
    expect(request.prompt).toContain("At least three examples");
  });

  it("refuses a concept requested through a different topic", async () => {
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    const otherTopicId = await app.topics.createTopic({ name: "Deno", goal: "" });
    expect(() => app.readings.getReading(otherTopicId, conceptId)).toThrow(NotFoundError);
  });
});
