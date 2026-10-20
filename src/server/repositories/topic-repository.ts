import { and, asc, count, desc, eq, max } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import {
  attempts,
  concepts,
  questions,
  quizzes,
  subtopics,
  topics,
  type ConceptRow,
  type SubtopicRow,
  type TopicRow,
} from "@/server/db/schema";

import { completeIfFullyAnswered, type Transaction } from "./quiz-completion";

export type NewTopic = typeof topics.$inferInsert;
export type NewSubtopic = typeof subtopics.$inferInsert;
export type NewConcept = typeof concepts.$inferInsert;

/** A subtopic to append; its position and its concepts' positions are assigned on insert. */
export interface AppendedSubtopic {
  subtopic: Omit<NewSubtopic, "position">;
  concepts: readonly Omit<NewConcept, "position" | "subtopicId" | "topicId">[];
}

/** Why a subtopic can't be deleted, or "deleted". */
export type DeleteSubtopicOutcome = "deleted" | "not_found" | "has_history" | "last_subtopic";

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

  /**
   * Deletes a subtopic with its concepts and lessons, but only when none of
   * its questions has ever been answered (or skipped) and it isn't the topic's
   * last subtopic. The checks run inside the transaction, so they can't race.
   *
   * Its unanswered questions disappear from quizzes along with the concepts.
   * Any quiz left with no questions is deleted; any quiz whose remaining
   * questions are all answered is completed.
   */
  deleteSubtopic(subtopicId: string, now: Date): DeleteSubtopicOutcome {
    return this.db.transaction((tx) => {
      const subtopic = tx.select().from(subtopics).where(eq(subtopics.id, subtopicId)).get();
      if (!subtopic) return "not_found";
      if (countSubtopics(tx, subtopic.topicId) <= 1) return "last_subtopic";
      if (subtopicAttemptCount(tx, subtopicId) > 0) return "has_history";

      const affectedQuizIds = tx
        .selectDistinct({ id: questions.quizId })
        .from(questions)
        .innerJoin(concepts, eq(questions.conceptId, concepts.id))
        .where(eq(concepts.subtopicId, subtopicId))
        .all()
        .map((row) => row.id);

      tx.delete(subtopics).where(eq(subtopics.id, subtopicId)).run();

      for (const quizId of affectedQuizIds) {
        const remaining = tx
          .select({ value: count() })
          .from(questions)
          .where(eq(questions.quizId, quizId))
          .get();
        if (!remaining?.value) {
          tx.delete(quizzes).where(eq(quizzes.id, quizId)).run();
        } else {
          completeIfFullyAnswered(tx, quizId, now);
        }
      }
      return "deleted";
    });
  }

  /** True when any question about the subtopic has an attempt (answered or skipped). */
  subtopicHasHistory(subtopicId: string): boolean {
    return subtopicAttemptCount(this.db, subtopicId) > 0;
  }

  countSubtopics(topicId: string): number {
    return countSubtopics(this.db, topicId);
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

function countSubtopics(db: AppDatabase | Transaction, topicId: string): number {
  return (
    db.select({ value: count() }).from(subtopics).where(eq(subtopics.topicId, topicId)).get()
      ?.value ?? 0
  );
}

function subtopicAttemptCount(db: AppDatabase | Transaction, subtopicId: string): number {
  return (
    db
      .select({ value: count() })
      .from(attempts)
      .innerJoin(questions, eq(attempts.questionId, questions.id))
      .innerJoin(concepts, eq(questions.conceptId, concepts.id))
      .where(eq(concepts.subtopicId, subtopicId))
      .get()?.value ?? 0
  );
}
