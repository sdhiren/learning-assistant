import { randomUUID } from "node:crypto";

import { NotFoundError } from "@/lib/errors";
import type { LlmClient } from "@/server/ai/llm-client";
import { buildReadingPrompt } from "@/server/ai/prompts";
import { readingSchema } from "@/server/ai/schemas";
import type { ConceptRow, TopicRow } from "@/server/db/schema";
import type { ReadingRepository } from "@/server/repositories/reading-repository";
import type { TopicRepository } from "@/server/repositories/topic-repository";

import { masteryFor, type ProgressService } from "./progress-service";
import type { ReadingView } from "./view-models";

export class ReadingService {
  constructor(
    private readonly topicRepository: TopicRepository,
    private readonly readingRepository: ReadingRepository,
    private readonly progressService: ProgressService,
    private readonly llm: LlmClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The concept page: concept details plus its saved reading, if any. */
  getReading(topicId: string, conceptId: string): ReadingView {
    const { topic, concept } = this.requireConcept(topicId, conceptId);
    const reading = this.readingRepository.findByConceptId(concept.id);
    const masteries = this.progressService.masteryByConceptForTopic(topic.id);

    return {
      conceptId: concept.id,
      conceptName: concept.name,
      conceptSummary: concept.summary,
      subtopicId: concept.subtopicId,
      subtopicName: this.topicRepository.findSubtopicById(concept.subtopicId)?.name ?? "",
      topicId: topic.id,
      topicName: topic.name,
      mastery: masteryFor(masteries, concept.id),
      content: reading
        ? {
            markdown: reading.markdown,
            keyTakeaways: reading.keyTakeaways,
            createdAt: reading.createdAt,
          }
        : null,
    };
  }

  /** Generates (or regenerates) the reading for a concept and saves it. */
  async generateReading(topicId: string, conceptId: string): Promise<void> {
    const { topic, concept } = this.requireConcept(topicId, conceptId);
    const output = await this.llm.generateStructured({
      task: "generate-reading",
      ...buildReadingPrompt({
        topicName: topic.name,
        goal: topic.goal,
        conceptName: concept.name,
        conceptSummary: concept.summary,
      }),
      schema: readingSchema,
      effort: "medium",
    });

    this.readingRepository.upsert({
      id: randomUUID(),
      conceptId: concept.id,
      markdown: output.markdown.trim(),
      keyTakeaways: output.keyTakeaways.map((point) => point.trim()).filter(Boolean),
      createdAt: this.now(),
    });
  }

  private requireConcept(
    topicId: string,
    conceptId: string,
  ): { topic: TopicRow; concept: ConceptRow } {
    const topic = this.topicRepository.findById(topicId);
    const concept = this.topicRepository.findConceptById(conceptId);
    if (!topic || !concept || concept.topicId !== topic.id) {
      throw new NotFoundError("Concept not found.");
    }
    return { topic, concept };
  }
}
