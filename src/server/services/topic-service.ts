import { randomUUID } from "node:crypto";

import { selectFocusConcepts } from "@/domain/concept-selection";
import type { CreateTopicInput } from "@/domain/input-schemas";
import { computeTopicProgress } from "@/domain/mastery";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { LlmClient } from "@/server/ai/llm-client";
import { buildSkillTreePrompt } from "@/server/ai/prompts";
import { skillTreeSchema, type SkillTreeOutput } from "@/server/ai/schemas";
import { isUniqueConstraintError } from "@/server/db/errors";
import type { ConceptRow, QuizRow, SubtopicRow } from "@/server/db/schema";
import type { AttemptEvidenceRow, QuizRepository } from "@/server/repositories/quiz-repository";
import type {
  NewConcept,
  NewSubtopic,
  TopicRepository,
} from "@/server/repositories/topic-repository";

import { masteryByConcept, masteryFor, type ProgressService } from "./progress-service";
import { buildSkillMap, focusLabelFor, toConceptView, toNameKey } from "./skill-map";
import type {
  QuizHistoryItemView,
  TopicOverviewView,
  TopicStatsView,
  TopicSummaryView,
} from "./view-models";

const RECENT_QUIZ_LIMIT = 10;
const FOCUS_AREA_COUNT = 3;

export class TopicService {
  constructor(
    private readonly topicRepository: TopicRepository,
    private readonly quizRepository: QuizRepository,
    private readonly progressService: ProgressService,
    private readonly llm: LlmClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Creates a topic and asks Claude to design its skill map. Returns the new id. */
  async createTopic(input: CreateTopicInput): Promise<string> {
    const nameKey = toNameKey(input.name);
    this.assertNameAvailable(nameKey);

    const skillTree = await this.llm.generateStructured({
      task: "generate-skill-tree",
      ...buildSkillTreePrompt({ topicName: input.name, goal: input.goal }),
      schema: skillTreeSchema,
      effort: "medium",
    });

    const topicId = randomUUID();
    const { subtopics, concepts } = toSkillMapRows(topicId, skillTree);
    try {
      this.topicRepository.createWithSkillMap(
        {
          id: topicId,
          name: input.name,
          nameKey,
          goal: input.goal,
          summary: skillTree.summary.trim(),
          createdAt: this.now(),
        },
        subtopics,
        concepts,
      );
    } catch (error) {
      // Another request created the same topic while Claude was working.
      if (isUniqueConstraintError(error)) {
        throw new ConflictError("You already have a topic with this name.", { cause: error });
      }
      throw error;
    }
    return topicId;
  }

  listTopics(): TopicSummaryView[] {
    const masteries = this.progressService.masteryByConceptForAllTopics();
    const conceptsByTopic = groupBy(this.topicRepository.listAllConcepts(), (c) => c.topicId);

    return this.topicRepository.listAll().map((topic) => {
      const topicConcepts = conceptsByTopic.get(topic.id) ?? [];
      return {
        id: topic.id,
        name: topic.name,
        summary: topic.summary,
        conceptCount: topicConcepts.length,
        progress: computeTopicProgress(topicConcepts.map((c) => masteryFor(masteries, c.id))),
        lastStudiedAt: topic.lastStudiedAt,
      };
    });
  }

  getTopicOverview(topicId: string): TopicOverviewView {
    const topic = this.topicRepository.findById(topicId);
    if (!topic) throw new NotFoundError("Topic not found.");

    const evidence = this.quizRepository.listAttemptEvidence(topicId);
    const masteries = masteryByConcept(evidence);
    const subtopics = this.topicRepository.listSubtopics(topicId);
    const concepts = this.topicRepository.listConcepts(topicId);
    const recentQuizzes = this.quizRepository.listByTopic(topicId, RECENT_QUIZ_LIMIT);
    const focusIds = new Set(
      selectFocusConcepts(
        concepts.map((concept) => ({
          id: concept.id,
          position: concept.position,
          mastery: masteryFor(masteries, concept.id),
        })),
        FOCUS_AREA_COUNT,
      ),
    );

    return {
      id: topic.id,
      name: topic.name,
      goal: topic.goal,
      summary: topic.summary,
      progress: computeTopicProgress(concepts.map((concept) => masteryFor(masteries, concept.id))),
      subtopics: buildSkillMap(subtopics, concepts, masteries),
      stats: this.computeStats(topicId, evidence, recentQuizzes),
      recentQuizzes: recentQuizzes.map((quiz) => toQuizHistoryItem(quiz, subtopics, concepts)),
      inProgressQuizId: this.quizRepository.findLatestInProgress(topicId)?.id ?? null,
      focusAreas: concepts
        .filter((concept) => focusIds.has(concept.id))
        .map((concept) => toConceptView(concept, masteries)),
    };
  }

  deleteTopic(topicId: string): void {
    if (!this.topicRepository.delete(topicId)) throw new NotFoundError("Topic not found.");
  }

  private assertNameAvailable(nameKey: string): void {
    if (this.topicRepository.findByNameKey(nameKey)) {
      throw new ConflictError("You already have a topic with this name.");
    }
  }

  private computeStats(
    topicId: string,
    evidence: readonly AttemptEvidenceRow[],
    recentQuizzes: readonly QuizRow[],
  ): TopicStatsView {
    const correctCount = evidence.filter((attempt) => attempt.isCorrect).length;
    const completed = recentQuizzes.filter((quiz) => quiz.status === "completed");

    return {
      completedQuizCount: this.quizRepository.countCompleted(topicId),
      answeredQuestionCount: evidence.length,
      accuracy: evidence.length > 0 ? correctCount / evidence.length : null,
      recentScores: completed
        .map((quiz) => quiz.score)
        .filter((score): score is number => score !== null)
        .reverse(),
    };
  }
}

/**
 * Converts Claude's skill tree into rows. Concept positions run across the
 * whole topic; a subtopic name Claude repeats is merged into the first one.
 */
function toSkillMapRows(
  topicId: string,
  skillTree: SkillTreeOutput,
): { subtopics: NewSubtopic[]; concepts: NewConcept[] } {
  const subtopics: NewSubtopic[] = [];
  const concepts: NewConcept[] = [];

  for (const generated of skillTree.subtopics) {
    const name = generated.name.trim();
    const nameKey = toNameKey(name);
    let subtopic = subtopics.find((candidate) => candidate.nameKey === nameKey);
    if (!subtopic) {
      subtopic = {
        id: randomUUID(),
        topicId,
        name,
        nameKey,
        origin: "generated",
        position: subtopics.length,
      };
      subtopics.push(subtopic);
    }
    for (const concept of generated.concepts) {
      concepts.push({
        id: randomUUID(),
        topicId,
        subtopicId: subtopic.id,
        name: concept.name.trim(),
        summary: concept.summary.trim(),
        position: concepts.length,
      });
    }
  }
  return { subtopics, concepts };
}

function toQuizHistoryItem(
  quiz: QuizRow,
  subtopics: readonly SubtopicRow[],
  concepts: readonly ConceptRow[],
): QuizHistoryItemView {
  return {
    id: quiz.id,
    difficulty: quiz.difficulty,
    status: quiz.status,
    score: quiz.score,
    createdAt: quiz.createdAt,
    focusLabel: focusLabelFor(quiz, subtopics, concepts),
  };
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
