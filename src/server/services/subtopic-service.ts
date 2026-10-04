import { randomUUID } from "node:crypto";

import type { AddSubtopicInput } from "@/domain/input-schemas";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { LlmClient } from "@/server/ai/llm-client";
import { buildSubtopicPrompt } from "@/server/ai/prompts";
import { newSubtopicSchema } from "@/server/ai/schemas";
import { isUniqueConstraintError } from "@/server/db/errors";
import type { TopicRow } from "@/server/db/schema";
import type { TopicRepository } from "@/server/repositories/topic-repository";

import type { ProgressService } from "./progress-service";
import { buildSkillMap, toNameKey } from "./skill-map";
import type { SubtopicDetailView } from "./view-models";

const DUPLICATE_MESSAGE = "This topic already has a subtopic with that name.";

/** Lets learners extend a topic's skill map with their own subtopics. */
export class SubtopicService {
  constructor(
    private readonly topicRepository: TopicRepository,
    private readonly progressService: ProgressService,
    private readonly llm: LlmClient,
  ) {}

  /**
   * Asks Claude to break the learner's subtopic into concepts that don't
   * duplicate the existing skill map, then appends it. Returns the new id.
   */
  async addSubtopic(input: AddSubtopicInput): Promise<string> {
    const topic = this.requireTopic(input.topicId);
    this.assertNameAvailable(topic.id, input.name);

    const subtopics = this.topicRepository.listSubtopics(topic.id);
    const concepts = this.topicRepository.listConcepts(topic.id);
    const generated = await this.llm.generateStructured({
      task: "generate-subtopic",
      ...buildSubtopicPrompt({
        topicName: topic.name,
        goal: topic.goal,
        subtopicName: input.name,
        notes: input.notes,
        existingSubtopics: subtopics.map((subtopic) => ({
          name: subtopic.name,
          conceptNames: concepts
            .filter((concept) => concept.subtopicId === subtopic.id)
            .map((concept) => concept.name),
        })),
      }),
      schema: newSubtopicSchema,
      effort: "medium",
    });

    // Claude may tidy the name (casing, typos); fall back to the learner's wording.
    const name = generated.name.trim() || input.name;
    this.assertNameAvailable(topic.id, name);

    const subtopicId = randomUUID();
    try {
      this.topicRepository.appendSubtopic({
        subtopic: {
          id: subtopicId,
          topicId: topic.id,
          name,
          nameKey: toNameKey(name),
          origin: "learner",
        },
        concepts: generated.concepts.map((concept) => ({
          id: randomUUID(),
          name: concept.name.trim(),
          summary: concept.summary.trim(),
        })),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(DUPLICATE_MESSAGE, { cause: error });
      }
      throw error;
    }
    return subtopicId;
  }

  getSubtopic(topicId: string, subtopicId: string): SubtopicDetailView {
    const topic = this.requireTopic(topicId);
    const subtopic = this.topicRepository.findSubtopicById(subtopicId);
    if (!subtopic || subtopic.topicId !== topic.id) {
      throw new NotFoundError("Subtopic not found.");
    }

    const masteries = this.progressService.masteryByConceptForTopic(topic.id);
    const concepts = this.topicRepository
      .listConcepts(topic.id)
      .filter((concept) => concept.subtopicId === subtopic.id);
    const [view] = buildSkillMap([subtopic], concepts, masteries);
    if (!view) throw new NotFoundError("Subtopic not found.");

    return { ...view, topicId: topic.id, topicName: topic.name };
  }

  private assertNameAvailable(topicId: string, name: string): void {
    if (this.topicRepository.findSubtopicByNameKey(topicId, toNameKey(name))) {
      throw new ConflictError(DUPLICATE_MESSAGE);
    }
  }

  private requireTopic(topicId: string): TopicRow {
    const topic = this.topicRepository.findById(topicId);
    if (!topic) throw new NotFoundError("Topic not found.");
    return topic;
  }
}
