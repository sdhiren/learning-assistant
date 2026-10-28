import type { z } from "zod";

import { AI_SCHEMAS, type AiSchemaName } from "@/server/ai/schemas";

const concept = (name: string) => ({ name, summary: `What ${name} means.` });

/** One valid model output per schema in `AI_SCHEMAS`, for contract tests. */
export const SCHEMA_FIXTURES: { [K in AiSchemaName]: z.output<(typeof AI_SCHEMAS)[K]> } = {
  skillTree: {
    summary: "JavaScript runs on a single thread. The event loop schedules work.",
    subtopics: ["Event loop", "Closures", "Promises"].map((name) => ({
      name,
      concepts: [concept(`${name} basics`), concept(`${name} pitfalls`)],
    })),
  },
  newSubtopic: { name: "Generators", concepts: [concept("yield"), concept("iterators")] },
  generatedQuiz: {
    questions: [
      {
        conceptId: "c1",
        type: "multiple_choice",
        prompt: "Which queue runs first?",
        code: null,
        codeLanguage: null,
        options: ["Microtasks", "Macrotasks", "Timers", "I/O"],
        correctOptionIndex: 0,
        expectedAnswer: null,
        rubric: [],
        explanation: "Microtasks drain before the next macrotask.",
      },
      {
        conceptId: "c2",
        type: "short_answer",
        prompt: "What is a closure?",
        code: null,
        codeLanguage: null,
        options: [],
        correctOptionIndex: null,
        expectedAnswer: "A function plus the scope it was created in.",
        rubric: ["Mentions captured scope", "Mentions lifetime"],
        explanation: "Closures keep their lexical environment alive.",
      },
    ],
  },
  codeReview: {
    score: 0.75,
    summary: "Correct but slow.",
    correctness: "Solves the problem.",
    edgeCases: "Misses the empty input.",
    complexity: "O(n^2) time; O(n) is possible.",
  },
  outputJudgement: { score: 1, feedback: "You predicted the output exactly." },
  shortAnswerGrade: { score: 0.5, feedback: "Half right.", missedPoints: ["Mentions lifetime"] },
  reading: {
    markdown: "## Overview\n\nThe event loop...",
    keyTakeaways: ["One thread", "Microtasks first", "Never block the loop"],
  },
};
