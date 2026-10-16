"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FlameIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DIFFICULTY_LABELS } from "@/domain/difficulty";
import type {
  AnswerResultView,
  QuizQuestionView,
  QuizSessionView,
} from "@/server/services/view-models";

import { QuestionCard } from "./question-card";
import { QuestionNavigator } from "./question-navigator";
import { QuizSummary } from "./quiz-summary";
import { UnansweredPanel } from "./unanswered-panel";

/**
 * Runs a quiz with free navigation: learners can go back, skip ahead and
 * return to skipped questions. Answers are graded on the server; an answer
 * key reaches the browser only after its question is answered or skipped.
 *
 * `currentIndex === questions.length` is the end screen: the results when
 * every question has an attempt, otherwise the list of unanswered questions.
 */
export function QuizPlayer({ quiz }: { quiz: QuizSessionView }) {
  const [questions, setQuestions] = useState(quiz.questions);
  const [currentIndex, setCurrentIndex] = useState(() => firstUnansweredIndex(quiz.questions));
  // Unsent answers and time spent survive navigating away from a question.
  const [drafts, setDrafts] = useState<Partial<Record<string, string>>>({});
  const elapsedMsRef = useRef(new Map<string, number>());
  // Correct answers in a row during this visit, for a little momentum.
  const [combo, setCombo] = useState(0);

  const answeredCount = questions.filter((question) => question.result).length;
  const endIndex = questions.length;
  const current = questions[currentIndex];

  const addTimeSpent = useCallback((questionId: string, ms: number) => {
    const elapsed = elapsedMsRef.current;
    elapsed.set(questionId, (elapsed.get(questionId) ?? 0) + ms);
  }, []);

  const getTimeSpent = useCallback(
    (questionId: string) => elapsedMsRef.current.get(questionId) ?? 0,
    [],
  );

  function handleAnswered(questionId: string, result: AnswerResultView) {
    setQuestions((previous) =>
      previous.map((question) => (question.id === questionId ? { ...question, result } : question)),
    );
    setDrafts((previous) => ({ ...previous, [questionId]: undefined }));
    setCombo((previous) => (result.isCorrect ? previous + 1 : 0));
  }

  /** Skip: move on to the next unanswered question, or the end screen. */
  function skip() {
    const nextUnanswered = questions.findIndex(
      (question, index) => index > currentIndex && !question.result,
    );
    setCurrentIndex(nextUnanswered === -1 ? endIndex : nextUnanswered);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">
            {current
              ? `Question ${currentIndex + 1} of ${questions.length}`
              : answeredCount === questions.length
                ? `${DIFFICULTY_LABELS[quiz.difficulty]} quiz complete`
                : "Almost done"}
          </span>
          <span className="flex items-center gap-3">
            {combo >= 2 && (
              <span
                key={combo}
                role="status"
                className="flex animate-pop items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-lift"
              >
                <FlameIcon className="size-3.5" />
                {combo} in a row
              </span>
            )}
            <span className="text-muted">
              {answeredCount}/{questions.length} answered
            </span>
            {current && answeredCount < questions.length && (
              <Button variant="ghost" size="sm" onClick={() => setCurrentIndex(endIndex)}>
                Finish quiz
              </Button>
            )}
          </span>
        </div>
        <ProgressBar value={answeredCount / questions.length} label="Quiz progress" />
        <QuestionNavigator
          questions={questions}
          currentIndex={currentIndex}
          onSelect={setCurrentIndex}
        />
      </div>

      {current ? (
        <QuestionCard
          key={current.id}
          question={current}
          draft={drafts[current.id] ?? ""}
          onDraftChange={(value) => setDrafts((previous) => ({ ...previous, [current.id]: value }))}
          getTimeSpent={getTimeSpent}
          onTimeSpent={addTimeSpent}
          onAnswered={(result) => handleAnswered(current.id, result)}
          onPrevious={currentIndex > 0 ? () => setCurrentIndex(currentIndex - 1) : null}
          onSkip={skip}
          onNext={() => setCurrentIndex(currentIndex + 1)}
          isLastQuestion={currentIndex === questions.length - 1}
        />
      ) : answeredCount === questions.length ? (
        <QuizSummary topicId={quiz.topicId} questions={questions} onReview={setCurrentIndex} />
      ) : (
        <UnansweredPanel
          quizId={quiz.id}
          questions={questions}
          onGoTo={setCurrentIndex}
          onFinished={(session) => setQuestions(session.questions)}
        />
      )}
    </div>
  );
}

function firstUnansweredIndex(questions: readonly QuizQuestionView[]): number {
  const index = questions.findIndex((question) => !question.result);
  return index === -1 ? questions.length : index;
}
