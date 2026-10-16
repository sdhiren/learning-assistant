import { summarizeActivity } from "@/domain/activity";
import { selectFocusConcepts } from "@/domain/concept-selection";
import type { Mastery } from "@/domain/mastery";
import type { QuizRepository } from "@/server/repositories/quiz-repository";
import type { TopicRepository } from "@/server/repositories/topic-repository";

import { masteryFor, type ProgressService } from "./progress-service";
import { focusLabelFor, toConceptView } from "./skill-map";
import type { DashboardView, InProgressQuizView, RecommendedConceptView } from "./view-models";

/** Days of history shown in the activity heatmap (12 weeks). */
const ACTIVITY_DAYS = 84;
const RECOMMENDATION_LIMIT = 3;

/** Builds the home page summary across every topic. */
export class DashboardService {
  constructor(
    private readonly topicRepository: TopicRepository,
    private readonly quizRepository: QuizRepository,
    private readonly progressService: ProgressService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getDashboard(): DashboardView {
    const answers = this.quizRepository.listAnswerLog();
    const masteries = this.progressService.masteryByConceptForAllTopics();
    const concepts = this.topicRepository.listAllConcepts();

    return {
      activity: summarizeActivity(
        answers.map((answer) => answer.answeredAt),
        this.now(),
        ACTIVITY_DAYS,
      ),
      accuracy:
        answers.length === 0
          ? null
          : answers.filter((answer) => answer.isCorrect).length / answers.length,
      conceptCount: concepts.length,
      strongConceptCount: concepts.filter(
        (concept) => masteryFor(masteries, concept.id).level === "strong",
      ).length,
      inProgressQuizzes: this.listInProgressQuizzes(),
      recommendations: this.recommend(masteries),
    };
  }

  private listInProgressQuizzes(): InProgressQuizView[] {
    const topicsById = new Map(this.topicRepository.listAll().map((topic) => [topic.id, topic]));
    return this.quizRepository.listInProgress().flatMap((quiz) => {
      const topic = topicsById.get(quiz.topicId);
      if (!topic) return [];
      const focusLabel =
        quiz.focusSubtopicId || quiz.focusConceptId
          ? focusLabelFor(
              quiz,
              this.topicRepository.listSubtopics(topic.id),
              this.topicRepository.listConcepts(topic.id),
            )
          : null;
      return [
        {
          id: quiz.id,
          topicId: topic.id,
          topicName: topic.name,
          difficulty: quiz.difficulty,
          focusLabel,
          ...this.quizRepository.countProgress(quiz.id),
        },
      ];
    });
  }

  /**
   * The single most useful concept to practise in each topic (weak first,
   * then new ones in curriculum order), with recently studied topics first.
   */
  private recommend(masteries: ReadonlyMap<string, Mastery>): RecommendedConceptView[] {
    return this.topicRepository
      .listAll()
      .flatMap((topic) => {
        const concepts = this.topicRepository.listConcepts(topic.id);
        const [conceptId] = selectFocusConcepts(
          concepts.map((concept) => ({
            id: concept.id,
            position: concept.position,
            mastery: masteryFor(masteries, concept.id),
          })),
          1,
        );
        const concept = concepts.find((candidate) => candidate.id === conceptId);
        if (!concept || masteryFor(masteries, concept.id).level === "strong") return [];
        return [
          { topicId: topic.id, topicName: topic.name, concept: toConceptView(concept, masteries) },
        ];
      })
      .slice(0, RECOMMENDATION_LIMIT);
  }
}
