import { computeMastery, type AttemptEvidence, type Mastery } from "@/domain/mastery";
import type { AttemptEvidenceRow, QuizRepository } from "@/server/repositories/quiz-repository";

/** Turns stored attempts into per-concept mastery estimates. */
export class ProgressService {
  constructor(private readonly quizRepository: QuizRepository) {}

  /** Mastery for every concept with attempts in the topic, keyed by concept id. */
  masteryByConceptForTopic(topicId: string): Map<string, Mastery> {
    return masteryByConcept(this.quizRepository.listAttemptEvidence(topicId));
  }

  /** Mastery for every practised concept across all topics. */
  masteryByConceptForAllTopics(): Map<string, Mastery> {
    return masteryByConcept(this.quizRepository.listAllAttemptEvidence());
  }
}

const NOT_STARTED: Mastery = { level: "not_started", score: null, attemptCount: 0 };

export function masteryFor(masteries: ReadonlyMap<string, Mastery>, conceptId: string): Mastery {
  return masteries.get(conceptId) ?? NOT_STARTED;
}

/** Groups attempts by concept and estimates mastery for each. */
export function masteryByConcept(rows: readonly AttemptEvidenceRow[]): Map<string, Mastery> {
  const evidenceByConcept = new Map<string, AttemptEvidence[]>();
  for (const row of rows) {
    const evidence = evidenceByConcept.get(row.conceptId) ?? [];
    evidence.push({ score: row.score, difficulty: row.difficulty, answeredAt: row.answeredAt });
    evidenceByConcept.set(row.conceptId, evidence);
  }

  return new Map(
    [...evidenceByConcept].map(([conceptId, evidence]) => [conceptId, computeMastery(evidence)]),
  );
}
