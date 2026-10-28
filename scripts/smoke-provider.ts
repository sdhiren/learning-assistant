/**
 * Manual smoke test: runs real model calls through the configured provider and
 * checks every response against its schema. Prompts were written for Claude,
 * so this is how quality is checked on other providers.
 *
 *   make smoke-provider PROVIDER=openai            # generate-quiz, grade-short-answer
 *   make smoke-provider PROVIDER=gemini TASKS=all  # every schema, including a lesson
 *
 * Prints one pass/fail line per task, never prompts, outputs or keys. Exits
 * non-zero if any task fails. Needs the provider's key (in .env.local or the
 * shell); run with `tsx --conditions=react-server` so `server-only` resolves.
 */
import type { ZodType } from "zod";

import type { LlmClient, ReasoningEffort } from "@/server/ai/llm-client";
import {
  buildCodeReviewPrompt,
  buildOutputGradingPrompt,
  buildQuizPrompt,
  buildReadingPrompt,
  buildShortAnswerGradingPrompt,
  buildSkillTreePrompt,
  buildSubtopicPrompt,
  type Prompt,
} from "@/server/ai/prompts";
import { redactSecrets } from "@/server/ai/provider-errors";
import { PROVIDER_IDS } from "@/server/ai/providers";
import {
  codeReviewSchema,
  generatedQuizSchema,
  newSubtopicSchema,
  outputJudgementSchema,
  readingSchema,
  shortAnswerGradeSchema,
  skillTreeSchema,
} from "@/server/ai/schemas";
import { getAiConfig } from "@/server/config/env";
import { createLlmClient } from "@/server/container";
import { toQuestionDraft } from "@/server/services/question-validation";

const TOPIC = { topicName: "JavaScript", goal: "Pass a senior frontend interview" };
const CONCEPTS = [
  {
    id: "c1",
    name: "Event loop",
    summary: "How tasks and microtasks are scheduled.",
    questionCount: 2,
  },
  {
    id: "c2",
    name: "Closures",
    summary: "Functions that capture their lexical scope.",
    questionCount: 2,
  },
];

interface SmokeTask {
  name: string;
  /** Runs the call and returns a short detail line, or throws. */
  run(llm: LlmClient): Promise<string>;
}

async function call<T>(
  llm: LlmClient,
  task: string,
  prompt: Prompt,
  schema: ZodType<T>,
  effort: ReasoningEffort,
): Promise<T> {
  return llm.generateStructured({ task, ...prompt, schema, effort });
}

const CORE_TASKS: SmokeTask[] = [
  {
    name: "generate-quiz",
    async run(llm) {
      const quiz = await call(
        llm,
        "generate-quiz",
        buildQuizPrompt({
          ...TOPIC,
          difficulty: "medium",
          concepts: CONCEPTS,
          recentQuestionPrompts: [],
          instructions: "",
        }),
        generatedQuizSchema,
        "medium",
      );
      const allowed = new Set(CONCEPTS.map((concept) => concept.id));
      const valid = quiz.questions.filter((question) => toQuestionDraft(question, allowed));
      const detail = `${valid.length}/${quiz.questions.length} questions pass toQuestionDraft`;
      if (quiz.questions.length === 0 || valid.length < quiz.questions.length)
        throw new Error(detail);
      return detail;
    },
  },
  {
    name: "grade-short-answer",
    async run(llm) {
      const grade = await call(
        llm,
        "grade-short-answer",
        buildShortAnswerGradingPrompt({
          topicName: TOPIC.topicName,
          difficulty: "medium",
          question: "What is a closure?",
          code: null,
          modelAnswer: "A function bundled with references to its surrounding lexical scope.",
          rubric: ["Mentions the captured lexical scope", "Mentions variables outliving the call"],
          learnerAnswer: "A function that remembers the variables from where it was defined.",
        }),
        shortAnswerGradeSchema,
        "low",
      );
      return `score ${grade.score}`;
    },
  },
];

const EXTRA_TASKS: SmokeTask[] = [
  {
    name: "generate-skill-tree",
    async run(llm) {
      const tree = await call(
        llm,
        "generate-skill-tree",
        buildSkillTreePrompt(TOPIC),
        skillTreeSchema,
        "medium",
      );
      return `${tree.subtopics.length} subtopics`;
    },
  },
  {
    name: "generate-subtopic",
    async run(llm) {
      const subtopic = await call(
        llm,
        "generate-subtopic",
        buildSubtopicPrompt({
          ...TOPIC,
          subtopicName: "generators",
          notes: "",
          existingSubtopics: [
            { name: "Async", conceptNames: CONCEPTS.map((concept) => concept.name) },
          ],
        }),
        newSubtopicSchema,
        "medium",
      );
      return `${subtopic.concepts.length} concepts`;
    },
  },
  {
    name: "grade-code-output",
    async run(llm) {
      const judgement = await call(
        llm,
        "grade-code-output",
        buildOutputGradingPrompt({
          topicName: TOPIC.topicName,
          difficulty: "medium",
          question: "What does this print?",
          code: "console.log(1); setTimeout(() => console.log(2)); Promise.resolve().then(() => console.log(3));",
          language: "javascript",
          expectedOutput: "1\n3\n2",
          learnerOutput: "1 3 2",
        }),
        outputJudgementSchema,
        "low",
      );
      return `score ${judgement.score}`;
    },
  },
  {
    name: "review-code",
    async run(llm) {
      const review = await call(
        llm,
        "review-code",
        buildCodeReviewPrompt({
          topicName: TOPIC.topicName,
          difficulty: "medium",
          task: "Return the sum of an array of numbers.",
          language: "javascript",
          starterCode: "function sum(numbers) {\n  // TODO\n}",
          referenceSolution:
            "function sum(numbers) {\n  return numbers.reduce((a, b) => a + b, 0);\n}",
          rubric: ["Correct result", "Handles the empty array", "O(n) time"],
          learnerSolution:
            "function sum(numbers) {\n  let t = 0;\n  for (const n of numbers) t += n;\n  return t;\n}",
        }),
        codeReviewSchema,
        "medium",
      );
      return `score ${review.score}`;
    },
  },
  {
    name: "write-lesson",
    async run(llm) {
      const reading = await call(
        llm,
        "write-lesson",
        buildReadingPrompt({
          ...TOPIC,
          subtopicName: "Async",
          conceptName: CONCEPTS[0]!.name,
          conceptSummary: CONCEPTS[0]!.summary,
          siblingConcepts: [CONCEPTS[1]!],
          prerequisiteConcepts: [],
          instructions: "",
        }),
        readingSchema,
        "medium",
      );
      return `${reading.markdown.length} chars, ${reading.keyTakeaways.length} takeaways`;
    },
  },
];

async function main(): Promise<number> {
  const provider = process.env.PROVIDER || process.env.AI_PROVIDER || "claude-code";
  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
    console.error(`✗ Unknown PROVIDER=${provider}. Use one of: ${PROVIDER_IDS.join(", ")}.`);
    return 1;
  }
  process.env.AI_PROVIDER = provider;

  const config = getAiConfig();
  const llm = createLlmClient(config);
  const tasks = process.env.TASKS === "all" ? [...CORE_TASKS, ...EXTRA_TASKS] : CORE_TASKS;
  console.log(`Smoke test: ${provider} (${config.model}), ${tasks.length} tasks\n`);

  const secrets = [config.apiKey];
  let failures = 0;
  for (const task of tasks) {
    const startedAt = Date.now();
    try {
      const detail = await task.run(llm);
      console.log(`✓ ${task.name} — ${seconds(startedAt)} — ${detail}`);
    } catch (error) {
      failures += 1;
      // Clients throw friendly AiGenerationErrors; their messages never hold prompts or keys.
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`✗ ${task.name} — ${seconds(startedAt)} — ${redactSecrets(reason, secrets)}`);
    }
  }

  console.log(`\n${tasks.length - failures}/${tasks.length} passed`);
  return failures === 0 ? 0 : 1;
}

function seconds(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Configuration errors (e.g. a missing key) print messages, never values.
    console.error(`✗ ${error instanceof Error ? redactSecrets(error.message) : String(error)}`);
    process.exit(1);
  },
);
