import { describe, expect, it } from "vitest";

import { selectFocusConcepts, type ConceptCandidate } from "./concept-selection";
import type { Mastery } from "./mastery";

const notStarted: Mastery = { level: "not_started", score: null, attemptCount: 0 };
const candidate = (id: string, position: number, mastery: Mastery = notStarted) => ({
  id,
  position,
  mastery,
});

describe("selectFocusConcepts", () => {
  it("prioritises weak concepts, then new ones in order, then developing, then strong", () => {
    const candidates: ConceptCandidate[] = [
      candidate("strong", 0, { level: "strong", score: 0.9, attemptCount: 4 }),
      candidate("developing", 1, { level: "developing", score: 0.6, attemptCount: 2 }),
      candidate("new-later", 3),
      candidate("new-first", 2),
      candidate("weak", 4, { level: "weak", score: 0.2, attemptCount: 2 }),
    ];
    expect(selectFocusConcepts(candidates, 5)).toEqual([
      "weak",
      "new-first",
      "new-later",
      "developing",
      "strong",
    ]);
  });

  it("repeats concepts when more questions than concepts are requested", () => {
    expect(selectFocusConcepts([candidate("a", 0), candidate("b", 1)], 5)).toEqual([
      "a",
      "b",
      "a",
      "b",
      "a",
    ]);
  });

  it("returns nothing for an empty topic", () => {
    expect(selectFocusConcepts([], 5)).toEqual([]);
  });
});
