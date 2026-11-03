import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import type { TopicSuggestionsOutput } from "@/server/ai/schemas";
import { createTestApp, SAMPLE_SKILL_TREE } from "@/test/test-app";

import type { LearnerProfile } from "./topic-suggestion-service";

const LEARNER: LearnerProfile = {
  interests: ["Go", "Databases"],
  targetRole: "Backend engineer",
  experienceLevel: "senior",
};

const AI_SUGGESTIONS: TopicSuggestionsOutput = {
  suggestions: [
    { name: "Go concurrency", reason: "You like Go.", goal: "Explain goroutines" },
    { name: "Raft consensus", reason: "Senior backend\nroles ask it.", goal: "Leader election" },
    { name: "raft  consensus", reason: "Duplicate.", goal: "" },
    { name: "PostgreSQL indexing", reason: "Databases.", goal: "B-tree vs hash" },
    { name: "Kafka internals", reason: "Backend.", goal: "" },
    { name: "Go memory model", reason: "Go.", goal: "" },
  ],
};

function appWithTopic(name = "Go concurrency") {
  const app = createTestApp();
  app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
  return { app, created: app.topics.createTopic({ name, goal: "" }) };
}

describe("TopicSuggestionService", () => {
  it("suggests catalog topics straight away, with no AI call", () => {
    const app = createTestApp();

    const view = app.suggestions.list(LEARNER);

    expect(view.source).toBe("catalog");
    expect(view.suggestions.map((s) => s.name)).toEqual([
      "Go concurrency",
      "PostgreSQL indexing",
      "Go interfaces",
      "Transactions and isolation levels",
      "Go memory model",
      "Database sharding",
    ]);
    expect(app.llm.requests).toHaveLength(0);
  });

  it("leaves out topics the learner already has", async () => {
    const { app, created } = appWithTopic("go  Concurrency");
    await created;

    const names = app.suggestions.list(LEARNER).suggestions.map((s) => s.name);

    expect(names).not.toContain("Go concurrency");
    expect(names).toContain("Go interfaces");
  });

  it("personalises with one suggest-topics call and caches the result", async () => {
    const { app, created } = appWithTopic();
    await created;
    app.llm.respondTo("suggest-topics", AI_SUGGESTIONS);

    const view = await app.suggestions.refresh(LEARNER);

    expect(view.source).toBe("ai");
    expect(view.suggestions).toEqual([
      { name: "Raft consensus", reason: "Senior backend roles ask it.", goal: "Leader election" },
      { name: "PostgreSQL indexing", reason: "Databases.", goal: "B-tree vs hash" },
      { name: "Kafka internals", reason: "Backend.", goal: "" },
      { name: "Go memory model", reason: "Go.", goal: "" },
    ]);
    expect(app.suggestions.list(LEARNER)).toEqual(view);
    expect(app.llmCalls().filter((call) => call.task === "suggest-topics")).toHaveLength(1);

    const [request] = app.llm.requestsFor("suggest-topics");
    expect(request?.effort).toBe("low");
    expect(request?.prompt).toContain("<topics_to_avoid>\n- Go concurrency\n</topics_to_avoid>");
  });

  it("replaces the cache on the next refresh", async () => {
    const app = createTestApp();
    app.llm.respondTo("suggest-topics", AI_SUGGESTIONS);
    await app.suggestions.refresh(LEARNER);
    app.llm.respondTo("suggest-topics", {
      suggestions: ["A topic", "B topic", "C topic", "D topic", "E topic"].map((name) => ({
        name,
        reason: "Fresh.",
        goal: "",
      })),
    });

    const view = await app.suggestions.refresh(LEARNER);

    expect(view.suggestions.map((s) => s.name)).toEqual([
      "A topic",
      "B topic",
      "C topic",
      "D topic",
      "E topic",
    ]);
  });

  it("drops a cached suggestion once it becomes a topic", async () => {
    const app = createTestApp();
    app.llm.respondTo("suggest-topics", AI_SUGGESTIONS);
    app.llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
    await app.suggestions.refresh(LEARNER);

    await app.topics.createTopic({ name: "Kafka internals", goal: "" });

    const names = app.suggestions.list(LEARNER).suggestions.map((s) => s.name);
    expect(names).not.toContain("Kafka internals");
  });

  it("never shows a dismissed suggestion again, from either source", async () => {
    const app = createTestApp();
    app.suggestions.dismiss("Go concurrency");
    expect(app.suggestions.list(LEARNER).suggestions.map((s) => s.name)).not.toContain(
      "Go concurrency",
    );

    app.llm.respondTo("suggest-topics", AI_SUGGESTIONS);
    await app.suggestions.refresh(LEARNER);
    app.suggestions.dismiss("Kafka internals");
    const names = app.suggestions.list(LEARNER).suggestions.map((s) => s.name);

    expect(names).not.toContain("Go concurrency");
    expect(names).not.toContain("Kafka internals");
    expect(names).toContain("Raft consensus");

    await app.suggestions.refresh(LEARNER);
    expect(app.suggestions.list(LEARNER).suggestions.map((s) => s.name)).not.toContain(
      "Kafka internals",
    );
  });

  it("asks for interests before personalising", async () => {
    const app = createTestApp();

    await expect(app.suggestions.refresh({ ...LEARNER, interests: [] })).rejects.toThrow(
      ValidationError,
    );
    expect(app.llm.requests).toHaveLength(0);
  });
});
