import { and, asc, desc, eq, max } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import {
  concepts,
  subtopics,
  topics,
  type ConceptRow,
  type SubtopicRow,
  type TopicRow,
} from "@/server/db/schema";

export type NewTopic = typeof topics.$inferInsert;
export type NewSubtopic = typeof subtopics.$inferInsert;
export type NewConcept = typeof concepts.$inferInsert;

/** A subtopic to append; its position and its concepts' positions are assigned on insert. */
export interface AppendedSubtopic {
  subtopic: Omit<NewSubtopic, "position">;
  concepts: readonly Omit<NewConcept, "position" | "subtopicId" | "topicId">[];
}

export class TopicRepository {
  constructor(private readonly db: AppDatabase) {}

  findById(topicId: string): TopicRow | undefined {
    return this.db.select().from(topics).where(eq(topics.id, topicId)).get();
  }

  findByNameKey(nameKey: string): TopicRow | undefined {
    return this.db.select().from(topics).where(eq(topics.nameKey, nameKey)).get();
  }

  /** Most recently studied first; never-studied topics ordered by creation. */
  listAll(): TopicRow[] {
    return this.db
      .select()
      .from(topics)
      .orderBy(desc(topics.lastStudiedAt), desc(topics.createdAt))
      .all();
  }

  /** Inserts a topic together with its skill map, atomically. */
  createWithSkillMap(
    topic: NewTopic,
    topicSubtopics: readonly NewSubtopic[],
    topicConcepts: readonly NewConcept[],
  ): void {
    this.db.transaction((tx) => {
      tx.insert(topics).values(topic).run();
      tx.insert(subtopics)
        .values([...topicSubtopics])
        .run();
      tx.insert(concepts)
        .values([...topicConcepts])
        .run();
    });
  }

  /**
   * Appends a subtopic and its concepts to the end of a topic's skill map.
   * Positions are read and written in one transaction so concurrent appends
   * can't collide.
   */
  appendSubtopic({ subtopic, concepts: newConcepts }: AppendedSubtopic): void {
    this.db.transaction((tx) => {
      const lastSubtopic = tx
        .select({ value: max(subtopics.position) })
        .from(subtopics)
        .where(eq(subtopics.topicId, subtopic.topicId))
        .get();
      const lastConcept = tx
        .select({ value: max(concepts.position) })
        .from(concepts)
        .where(eq(concepts.topicId, subtopic.topicId))
        .get();
      const firstConceptPosition = (lastConcept?.value ?? -1) + 1;

      tx.insert(subtopics)
        .values({ ...subtopic, position: (lastSubtopic?.value ?? -1) + 1 })
        .run();
      tx.insert(concepts)
        .values(
          newConcepts.map((concept, index) => ({
            ...concept,
            topicId: subtopic.topicId,
            subtopicId: subtopic.id,
            position: firstConceptPosition + index,
          })),
        )
        .run();
    });
  }

  markStudied(topicId: string, studiedAt: Date): void {
    this.db.update(topics).set({ lastStudiedAt: studiedAt }).where(eq(topics.id, topicId)).run();
  }

  /** Deletes a topic; subtopics, concepts, quizzes, questions, attempts and readings cascade. */
  delete(topicId: string): boolean {
    return this.db.delete(topics).where(eq(topics.id, topicId)).run().changes > 0;
  }

  listSubtopics(topicId: string): SubtopicRow[] {
    return this.db
      .select()
      .from(subtopics)
      .where(eq(subtopics.topicId, topicId))
      .orderBy(asc(subtopics.position))
      .all();
  }

  findSubtopicById(subtopicId: string): SubtopicRow | undefined {
    return this.db.select().from(subtopics).where(eq(subtopics.id, subtopicId)).get();
  }

  findSubtopicByNameKey(topicId: string, nameKey: string): SubtopicRow | undefined {
    return this.db
      .select()
      .from(subtopics)
      .where(and(eq(subtopics.topicId, topicId), eq(subtopics.nameKey, nameKey)))
      .get();
  }

  /** A topic's concepts in curriculum order. */
  listConcepts(topicId: string): ConceptRow[] {
    return this.db
      .select()
      .from(concepts)
      .where(eq(concepts.topicId, topicId))
      .orderBy(asc(concepts.position))
      .all();
  }

  listAllConcepts(): ConceptRow[] {
    return this.db.select().from(concepts).orderBy(asc(concepts.position)).all();
  }

  findConceptById(conceptId: string): ConceptRow | undefined {
    return this.db.select().from(concepts).where(eq(concepts.id, conceptId)).get();
  }
}
