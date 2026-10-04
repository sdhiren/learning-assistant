import { computeTopicProgress, type Mastery } from "@/domain/mastery";
import type { ConceptRow, QuizRow, SubtopicRow } from "@/server/db/schema";

import { masteryFor } from "./progress-service";
import type { ConceptView, SubtopicView } from "./view-models";

/** Case- and whitespace-insensitive key used to detect duplicate names. */
export function toNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function toConceptView(
  concept: ConceptRow,
  masteries: ReadonlyMap<string, Mastery>,
): ConceptView {
  return {
    id: concept.id,
    name: concept.name,
    summary: concept.summary,
    mastery: masteryFor(masteries, concept.id),
  };
}

/** Groups concepts under their subtopics, both in curriculum order. */
export function buildSkillMap(
  subtopics: readonly SubtopicRow[],
  concepts: readonly ConceptRow[],
  masteries: ReadonlyMap<string, Mastery>,
): SubtopicView[] {
  const conceptsBySubtopic = new Map<string, ConceptView[]>();
  for (const concept of concepts) {
    const group = conceptsBySubtopic.get(concept.subtopicId);
    const view = toConceptView(concept, masteries);
    if (group) group.push(view);
    else conceptsBySubtopic.set(concept.subtopicId, [view]);
  }

  return subtopics.map((subtopic) => {
    const subtopicConcepts = conceptsBySubtopic.get(subtopic.id) ?? [];
    return {
      id: subtopic.id,
      name: subtopic.name,
      origin: subtopic.origin,
      progress: computeTopicProgress(subtopicConcepts.map((concept) => concept.mastery)),
      concepts: subtopicConcepts,
    };
  });
}

/** The name of the subtopic or concept a quiz focused on, or null for "weak spots". */
export function focusLabelFor(
  quiz: Pick<QuizRow, "focusSubtopicId" | "focusConceptId">,
  subtopics: readonly SubtopicRow[],
  concepts: readonly ConceptRow[],
): string | null {
  if (quiz.focusSubtopicId) {
    return subtopics.find((subtopic) => subtopic.id === quiz.focusSubtopicId)?.name ?? null;
  }
  if (quiz.focusConceptId) {
    return concepts.find((concept) => concept.id === quiz.focusConceptId)?.name ?? null;
  }
  return null;
}
