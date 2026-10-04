"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Spinner } from "@/components/ui/spinner";
import { ANSWER_MAX_LENGTH } from "@/domain/input-schemas";
import { QUESTION_TYPE_LABELS } from "@/domain/question";
import { submitAnswerAction } from "@/server/actions/quiz-actions";
import type { AnswerResultView, QuizQuestionView } from "@/server/services/view-models";

import { AnswerFeedback } from "./answer-feedback";
import { MultipleChoiceOptions } from "./multiple-choice-options";

interface QuestionCardProps {
  question: QuizQuestionView;
  /** The learner's unsent answer (kept by the player across navigation). */
  draft: string;
  onDraftChange: (value: string) => void;
  /** Time already spent on this question during earlier visits. */
  getTimeSpent: (questionId: string) => number;
  onTimeSpent: (questionId: string, ms: number) => void;
  onAnswered: (result: AnswerResultView) => void;
  /** Null on the first question. */
  onPrevious: (() => void) | null;
  onSkip: () => void;
  onNext: () => void;
  isLastQuestion: boolean;
}

export function QuestionCard({
  question,
  draft: answer,
  onDraftChange: setAnswer,
  getTimeSpent,
  onTimeSpent,
  onAnswered,
  onPrevious,
  onSkip,
  onNext,
  isLastQuestion,
}: QuestionCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shownAtRef = useRef(0);
  const answeredRef = useRef(Boolean(question.result));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const result = question.result;
  const questionId = question.id;

  // Track time on screen; time from earlier visits is added when answering.
  useEffect(() => {
    shownAtRef.current = Date.now();
    headingRef.current?.focus();
    return () => {
      if (!answeredRef.current) onTimeSpent(questionId, Date.now() - shownAtRef.current);
    };
  }, [questionId, onTimeSpent]);

  useEffect(() => {
    if (result) nextButtonRef.current?.focus();
  }, [result]);

  function submit() {
    if (pending || result || !answer.trim()) return;
    setError(null);
    const timeTakenMs = getTimeSpent(questionId) + (Date.now() - shownAtRef.current);
    startTransition(async () => {
      const response = await submitAnswerAction({ questionId, answer, timeTakenMs });
      if (response.ok) {
        answeredRef.current = true;
        onAnswered(response.data.result);
      } else {
        setError(response.error);
      }
    });
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  const isTextAnswer = question.type !== "multiple_choice";
  const previousButton = onPrevious && (
    <Button variant="ghost" size="lg" onClick={onPrevious} disabled={pending}>
      ← Previous
    </Button>
  );

  return (
    <article className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-7">
      <div className="space-y-3">
        <p className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">
            {question.conceptName}
          </span>
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-muted">
            {QUESTION_TYPE_LABELS[question.type]}
          </span>
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-lg leading-snug font-semibold whitespace-pre-line focus:outline-none sm:text-xl"
        >
          {question.prompt}
        </h1>
      </div>

      {question.code && <CodeBlock code={question.code} language={question.codeLanguage} />}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
        aria-busy={pending}
      >
        {question.type === "multiple_choice" && question.options ? (
          <MultipleChoiceOptions
            questionId={question.id}
            options={question.options}
            value={result ? result.answer : answer}
            onChange={setAnswer}
            result={result}
            disabled={pending || Boolean(result)}
          />
        ) : result?.skipped ? null : (
          <div className="space-y-1.5">
            <label htmlFor={`answer-${question.id}`} className="text-sm font-medium">
              {question.type === "code_output" ? "Exact output" : "Your answer"}
            </label>
            <textarea
              id={`answer-${question.id}`}
              value={result ? result.answer : answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={handleTextKeyDown}
              readOnly={Boolean(result)}
              disabled={pending}
              maxLength={ANSWER_MAX_LENGTH}
              rows={question.type === "code_output" ? 4 : 6}
              spellCheck={question.type !== "code_output"}
              placeholder={
                question.type === "code_output"
                  ? "Type exactly what the program prints"
                  : "Explain it as you would to an interviewer"
              }
              aria-describedby={`answer-hint-${question.id}`}
              className={
                "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-3 text-ink " +
                "focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 " +
                (question.type === "code_output" ? "font-mono text-sm" : "")
              }
            />
            <p id={`answer-hint-${question.id}`} className="text-xs text-muted">
              Press ⌘/Ctrl + Enter to submit.
            </p>
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        {!result && (
          <div className="flex flex-wrap items-center gap-3">
            {previousButton}
            <Button type="submit" size="lg" disabled={pending || !answer.trim()}>
              {pending && <Spinner />}
              {pending ? (isTextAnswer ? "Grading…" : "Checking…") : "Submit answer"}
            </Button>
            <Button variant="secondary" size="lg" onClick={onSkip} disabled={pending}>
              Skip for now
            </Button>
            {pending && question.type === "short_answer" && (
              <span className="text-sm text-muted" aria-live="polite">
                Claude is reviewing your answer…
              </span>
            )}
          </div>
        )}
      </form>

      {result && (
        <>
          <AnswerFeedback result={result} showCorrectAnswer={isTextAnswer} />
          <div className="flex flex-wrap items-center gap-3">
            {previousButton}
            <Button ref={nextButtonRef} size="lg" onClick={onNext}>
              {isLastQuestion ? "Finish" : "Next question →"}
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
