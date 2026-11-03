import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { count } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { ProfileContainer, type ProfileRef } from "@/server/container";
import { createRegistryDatabase } from "@/server/db/app-client";
import { createDatabase } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { ensureLegacyProfile, LEGACY_PROFILE } from "@/server/registry-bootstrap";
import { ProfileRepository } from "@/server/repositories/profile-repository";
import { FakeLlmClient } from "@/test/fake-llm-client";
import { SAMPLE_SKILL_TREE, shortAnswerQuestion } from "@/test/test-app";

const AI_CONFIG = { provider: "claude-code", model: "claude-opus-5-5", timeoutMs: 60_000 } as const;

let dir: string;
let llm: FakeLlmClient;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "la-profiles-"));
  llm = new FakeLlmClient();
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function newContainer(aiConfig: () => typeof AI_CONFIG | { model: string } = () => AI_CONFIG) {
  return new ProfileContainer({
    createLlm: () => llm,
    aiConfig: () => ({ ...AI_CONFIG, ...aiConfig() }),
  });
}

function profile(name: string): ProfileRef {
  return { id: `${name}-id`, dbPath: path.join(dir, name, "learning-assistant.db") };
}

/** Creates a topic, a quiz with one answer, and a lesson in the given profile. */
async function seed(container: ProfileContainer, ref: ProfileRef) {
  const services = container.servicesFor(ref);
  llm.respondTo("generate-skill-tree", SAMPLE_SKILL_TREE);
  const topicId = await services.topics.createTopic({ name: "Node.js", goal: "" });
  const overview = services.topics.getTopicOverview(topicId);
  const subtopic = overview.subtopics[0]!;
  const conceptId = subtopic.concepts[0]!.id;

  llm.respondTo("generate-quiz", { questions: [shortAnswerQuestion(conceptId)] });
  const quizId = await services.quizzes.startQuiz({
    topicId,
    difficulty: "medium",
    questionCount: 1,
    focus: { kind: "weak_spots" },
    instructions: "",
  });
  const [question] = services.quizzes.getQuizSession(quizId).questions;
  llm.respondTo("grade-short-answer", { score: 1, feedback: "Good.", missedPoints: [] });
  await services.quizzes.submitAnswer({ questionId: question!.id, answer: "x", timeTakenMs: 1 });

  llm.respondTo("generate-reading", { markdown: "## Idea\nText", keyTakeaways: ["a", "b", "c"] });
  await services.readings.generateReading({ topicId, conceptId, instructions: "" });

  return { topicId, subtopicId: subtopic.id, conceptId, quizId };
}

function rowCounts(dbPath: string): Record<string, number> {
  const db = createDatabase(dbPath);
  const tables = {
    topics: schema.topics,
    subtopics: schema.subtopics,
    concepts: schema.concepts,
    quizzes: schema.quizzes,
    questions: schema.questions,
    attempts: schema.attempts,
    readings: schema.readings,
    llm_calls: schema.llmCalls,
  };
  const counts = Object.fromEntries(
    Object.entries(tables).map(([name, table]) => [
      name,
      db.select({ n: count() }).from(table).get()!.n,
    ]),
  );
  db.$client.close();
  return counts;
}

describe("profile isolation", () => {
  it("gives each profile its own database, so ids from A are not found in B", async () => {
    const container = newContainer();
    const a = profile("a");
    const b = profile("b");
    const ids = await seed(container, a);
    const servicesB = container.servicesFor(b);

    expect(() => servicesB.topics.getTopicOverview(ids.topicId)).toThrow(NotFoundError);
    expect(() => servicesB.subtopics.getSubtopic(ids.topicId, ids.subtopicId)).toThrow(
      NotFoundError,
    );
    expect(() => servicesB.readings.getReading(ids.topicId, ids.conceptId)).toThrow(NotFoundError);
    expect(() => servicesB.quizzes.getQuizSession(ids.quizId)).toThrow(NotFoundError);
    expect(servicesB.topics.listTopics()).toEqual([]);
    expect(servicesB.dashboard.getDashboard().conceptCount).toBe(0);
    expect(servicesB.usage.getUsage().tasks).toEqual([]);
    expect(servicesB.usage.getUsage().providers).toEqual([]);

    expect(container.servicesFor(a).topics.listTopics()).toHaveLength(1);
    expect(rowCounts(b.dbPath).topics).toBe(0);
  });

  it("caches services per profile and rebuilds them after invalidation or an AI change", () => {
    let model = "claude-opus-5-5";
    const container = newContainer(() => ({ model }));
    const a = profile("a");

    const first = container.servicesFor(a);
    expect(container.servicesFor(a)).toBe(first);

    container.invalidate(a.id);
    const second = container.servicesFor(a);
    expect(second).not.toBe(first);

    model = "claude-sonnet-5-5";
    expect(container.servicesFor(a)).not.toBe(second);
  });
});

describe("ensureLegacyProfile", () => {
  it("creates no profile on a fresh install", () => {
    const registry = createRegistryDatabase(":memory:");
    expect(ensureLegacyProfile(registry, path.join(dir, "missing.db"))).toBe(false);
    expect(new ProfileRepository(registry).list()).toEqual([]);
  });

  it("registers the existing database as sdhiren in place, with every row unchanged", async () => {
    const legacyPath = path.join(dir, "learning-assistant.db");
    const legacy: ProfileRef = { id: "legacy", dbPath: legacyPath };
    const ids = await seed(newContainer(), legacy);
    const before = rowCounts(legacyPath);

    const registry = createRegistryDatabase(path.join(dir, "app.db"));
    expect(ensureLegacyProfile(registry, legacyPath)).toBe(true);
    expect(ensureLegacyProfile(registry, legacyPath)).toBe(false);

    const profiles = new ProfileRepository(registry).list();
    expect(profiles).toHaveLength(1);
    const sdhiren = profiles[0]!;
    expect(sdhiren).toMatchObject({
      username: LEGACY_PROFILE.username,
      firstName: "Dhirendra",
      lastName: "Singh",
      passwordHash: null,
      dbPath: legacyPath,
      aiProvider: null,
      aiModel: null,
    });
    expect(new ProfileRepository(registry).findByUsername("SDHIREN")?.id).toBe(sdhiren.id);

    expect(rowCounts(legacyPath)).toEqual(before);
    const services = newContainer().servicesFor(sdhiren);
    expect(services.topics.getTopicOverview(ids.topicId).name).toBe("Node.js");
    const calls = services.usage.getUsage().tasks.reduce((sum, task) => sum + task.calls, 0);
    expect(calls).toBe(before.llm_calls);
  });

  it("does nothing when profiles already exist", () => {
    const legacyPath = path.join(dir, "learning-assistant.db");
    createDatabase(legacyPath).$client.close();
    const registry = createRegistryDatabase(":memory:");
    new ProfileRepository(registry).insert({
      id: "other",
      username: "alex",
      usernameKey: "alex",
      firstName: "Alex",
      lastName: "Doe",
      dbPath: path.join(dir, "alex.db"),
      createdAt: new Date(),
    });

    expect(ensureLegacyProfile(registry, legacyPath)).toBe(false);
    expect(new ProfileRepository(registry).list().map((p) => p.username)).toEqual(["alex"]);
  });
});
