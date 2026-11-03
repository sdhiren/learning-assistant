import { randomUUID } from "node:crypto";

import { suggestFromCatalog, suggestionNameKey } from "@/domain/interests";
import type { ExperienceLevel } from "@/domain/profile";
import { ValidationError } from "@/lib/errors";
import type { LlmClient } from "@/server/ai/llm-client";
import { buildTopicSuggestionsPrompt } from "@/server/ai/prompts";
import { topicSuggestionsSchema } from "@/server/ai/schemas";
import type { TopicRepository } from "@/server/repositories/topic-repository";
import type { TopicSuggestionRepository } from "@/server/repositories/topic-suggestion-repository";

import type { TopicSuggestionsView } from "./view-models";

const CATALOG_SUGGESTION_LIMIT = 6;

/** What the profile says about the learner. Comes from the registry, not the profile DB. */
export interface LearnerProfile {
  interests: readonly string[];
  targetRole: string;
  experienceLevel: ExperienceLevel | null;
}

/**
 * "Suggested for you" topics. Catalog suggestions are instant and free; AI
 * suggestions replace them once the learner asks to personalise, and stay
 * cached until the next refresh. Topics the learner already has, and
 * dismissed suggestions, are never shown.
 */
export class TopicSuggestionService {
  constructor(
    private readonly topicRepository: TopicRepository,
    private readonly suggestionRepository: TopicSuggestionRepository,
    private readonly llm: LlmClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(learner: LearnerProfile): TopicSuggestionsView {
    const excluded = this.excludedNameKeys();
    const cached = this.suggestionRepository
      .listActiveAi()
      .filter((row) => !excluded.has(row.nameKey))
      .map(({ name, reason, goal }) => ({ name, reason, goal }));
    if (cached.length > 0) return { source: "ai", suggestions: cached };

    const catalog = suggestFromCatalog(learner.interests, excluded, CATALOG_SUGGESTION_LIMIT);
    return { source: "catalog", suggestions: catalog.map((s) => ({ ...s, goal: "" })) };
  }

  /** Asks the AI for fresh suggestions and caches them, replacing the previous ones. */
  async refresh(learner: LearnerProfile): Promise<TopicSuggestionsView> {
    if (learner.interests.length === 0) {
      throw new ValidationError("Add some interests to your profile first.");
    }
    const excluded = this.excludedNameKeys();
    const excludedTopicNames = this.topicRepository.listAll().map((topic) => topic.name);

    const output = await this.llm.generateStructured({
      task: "suggest-topics",
      ...buildTopicSuggestionsPrompt({ ...learner, excludedTopicNames }),
      schema: topicSuggestionsSchema,
      effort: "low",
    });

    const createdAt = this.now().getTime();
    const seen = new Set(excluded);
    const rows = [];
    for (const suggestion of output.suggestions) {
      const name = singleLine(suggestion.name);
      const nameKey = suggestionNameKey(name);
      if (!name || seen.has(nameKey)) continue;
      seen.add(nameKey);
      rows.push({
        id: randomUUID(),
        name,
        nameKey,
        reason: singleLine(suggestion.reason),
        goal: singleLine(suggestion.goal),
        source: "ai" as const,
        // Spaced by a millisecond so listing keeps the model's order.
        createdAt: new Date(createdAt + rows.length),
      });
    }
    this.suggestionRepository.replaceAi(rows);
    return this.list(learner);
  }

  dismiss(name: string): void {
    const now = this.now();
    this.suggestionRepository.dismiss({
      id: randomUUID(),
      name,
      nameKey: suggestionNameKey(name),
      reason: "",
      source: "catalog",
      createdAt: now,
      dismissedAt: now,
    });
  }

  private excludedNameKeys(): Set<string> {
    return new Set([
      ...this.topicRepository.listAll().map((topic) => topic.nameKey),
      ...this.suggestionRepository.listDismissedNameKeys(),
    ]);
  }
}

/** Model text can contain newlines; suggestions feed single-line topic fields. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
