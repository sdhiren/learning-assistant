import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import { topicSuggestions, type TopicSuggestionRow } from "@/server/db/schema";

export type NewTopicSuggestion = typeof topicSuggestions.$inferInsert;

export class TopicSuggestionRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Cached AI suggestions that haven't been dismissed, in the order the model gave them. */
  listActiveAi(): TopicSuggestionRow[] {
    return this.db
      .select()
      .from(topicSuggestions)
      .where(and(eq(topicSuggestions.source, "ai"), isNull(topicSuggestions.dismissedAt)))
      .orderBy(asc(topicSuggestions.createdAt), asc(topicSuggestions.id))
      .all();
  }

  listDismissedNameKeys(): string[] {
    return this.db
      .select({ nameKey: topicSuggestions.nameKey })
      .from(topicSuggestions)
      .where(isNotNull(topicSuggestions.dismissedAt))
      .all()
      .map((row) => row.nameKey);
  }

  /** Replaces the cached AI suggestions in one transaction. Dismissed rows are kept. */
  replaceAi(suggestions: readonly NewTopicSuggestion[]): void {
    this.db.transaction((tx) => {
      tx.delete(topicSuggestions)
        .where(and(eq(topicSuggestions.source, "ai"), isNull(topicSuggestions.dismissedAt)))
        .run();
      if (suggestions.length === 0) return;
      tx.insert(topicSuggestions)
        .values([...suggestions])
        .run();
    });
  }

  /** Marks a suggestion dismissed, adding a row for it if it was a catalog suggestion. */
  dismiss(suggestion: NewTopicSuggestion & { dismissedAt: Date }): void {
    this.db
      .insert(topicSuggestions)
      .values(suggestion)
      .onConflictDoUpdate({
        target: topicSuggestions.nameKey,
        set: { dismissedAt: suggestion.dismissedAt },
      })
      .run();
  }
}
