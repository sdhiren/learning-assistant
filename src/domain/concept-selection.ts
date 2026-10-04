import type { Mastery, MasteryLevel } from "./mastery";

export interface ConceptCandidate {
  id: string;
  /** Position in the curriculum (lower comes first). */
  position: number;
  mastery: Mastery;
}

/** Lower number = practise sooner. */
const LEVEL_PRIORITY: Readonly<Record<MasteryLevel, number>> = {
  weak: 0,
  not_started: 1,
  developing: 2,
  strong: 3,
};

/**
 * Chooses which concepts the next quiz should cover, so that "continue"
 * always resumes where practice is most valuable: weak concepts first, then
 * new ones in curriculum order, then the ones still developing.
 *
 * Returns up to `count` concept ids; it repeats from the top of the list if
 * the topic has fewer concepts than requested questions.
 */
export function selectFocusConcepts(
  candidates: readonly ConceptCandidate[],
  count: number,
): string[] {
  if (candidates.length === 0 || count <= 0) return [];

  const ranked = [...candidates].sort(
    (a, b) =>
      LEVEL_PRIORITY[a.mastery.level] - LEVEL_PRIORITY[b.mastery.level] ||
      (a.mastery.score ?? 0) - (b.mastery.score ?? 0) ||
      a.position - b.position,
  );

  return Array.from({ length: count }, (_, index) => ranked[index % ranked.length]!.id);
}
