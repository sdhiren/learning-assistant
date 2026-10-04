import type { Difficulty } from "@/domain/difficulty";
import type { Mastery } from "@/domain/mastery";
import type { QuestionType } from "@/domain/question";
import type { QuizStatus, SubtopicOrigin } from "@/server/db/schema";

/**
 * Data shapes passed from the server to the UI. They contain only what the
 * UI renders. Answer keys in particular never leave the server until the
 * question has been answered.
 */

export interface TopicSummaryView {
  id: string;
  name: string;
  summary: string;
  conceptCount: number;
  /** 0 to 1. */
  progress: number;
  lastStudiedAt: Date | null;
}

export interface ConceptView {
  id: string;
  name: string;
  summary: string;
  mastery: Mastery;
}

export interface SubtopicView {
  id: string;
  name: string;
  origin: SubtopicOrigin;
  /** Mean concept mastery from 0 to 1 (unpractised concepts count as 0). */
  progress: number;
  concepts: ConceptView[];
}

export interface SubtopicDetailView extends SubtopicView {
  topicId: string;
  topicName: string;
}

export interface QuizHistoryItemView {
  id: string;
  difficulty: Difficulty;
  status: QuizStatus;
  score: number | null;
  createdAt: Date;
  /** The concept or subtopic the quiz focused on, or null for "weak spots". */
  focusLabel: string | null;
}

export interface TopicStatsView {
  completedQuizCount: number;
  answeredQuestionCount: number;
  /** Share of answers that were correct, or null with no answers. */
  accuracy: number | null;
  /** Scores of completed quizzes, oldest first. */
  recentScores: number[];
}

export interface TopicOverviewView {
  id: string;
  name: string;
  goal: string;
  summary: string;
  progress: number;
  subtopics: SubtopicView[];
  stats: TopicStatsView;
  recentQuizzes: QuizHistoryItemView[];
  inProgressQuizId: string | null;
  /** The concepts most in need of practice. */
  focusAreas: ConceptView[];
}

export interface AnswerResultView {
  answer: string;
  score: number;
  isCorrect: boolean;
  feedback: string;
  explanation: string;
  correctAnswer: string;
}

export interface QuizQuestionView {
  id: string;
  position: number;
  type: QuestionType;
  conceptName: string;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[] | null;
  /** Null until answered. */
  result: AnswerResultView | null;
}

export interface QuizSessionView {
  id: string;
  topicId: string;
  topicName: string;
  difficulty: Difficulty;
  focusLabel: string | null;
  status: QuizStatus;
  score: number | null;
  questions: QuizQuestionView[];
}

export interface SubmitAnswerResultView {
  result: AnswerResultView;
  quizCompleted: boolean;
}

export interface ReadingView {
  conceptId: string;
  conceptName: string;
  conceptSummary: string;
  subtopicId: string;
  subtopicName: string;
  topicId: string;
  topicName: string;
  mastery: Mastery;
  content: { markdown: string; keyTakeaways: string[]; createdAt: Date } | null;
}
