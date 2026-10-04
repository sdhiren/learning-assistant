"use client";

import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  DIFFICULTIES,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  type Difficulty,
} from "@/domain/difficulty";
import { encodeQuizFocus, QUESTION_COUNT_OPTIONS, type QuizFocus } from "@/domain/input-schemas";
import { cn } from "@/lib/cn";
import { startQuizAction } from "@/server/actions/quiz-actions";

/** A subtopic and its concepts, as offered in the "Focus on" picker. */
export interface FocusOption {
  id: string;
  name: string;
  concepts: readonly { id: string; name: string }[];
}

interface StartQuizFormProps {
  topicId: string;
  /** Subtopics offered in the "Focus on" picker. Ignored when `fixedFocus` is set. */
  focusOptions?: readonly FocusOption[];
  /** Locks the quiz to one subtopic or concept (used on their own pages). */
  fixedFocus?: QuizFocus;
}

const choiceClasses =
  "flex cursor-pointer rounded-lg border border-border-strong bg-surface px-3 py-2.5 transition-colors " +
  "hover:border-accent/60 has-checked:border-accent has-checked:bg-accent-soft " +
  "has-focus-visible:outline-2 has-focus-visible:outline-accent";

const DEFAULT_DIFFICULTY: Difficulty = "medium";

export function StartQuizForm({ topicId, focusOptions, fixedFocus }: StartQuizFormProps) {
  const { result: state, values, formAction, pending } = useFormAction(startQuizAction);
  const selectedDifficulty = values.difficulty ?? DEFAULT_DIFFICULTY;
  const selectedCount = values.questionCount ?? String(QUESTION_COUNT_OPTIONS[0]);

  return (
    <form action={formAction} className="space-y-5" aria-busy={pending}>
      <input type="hidden" name="topicId" value={topicId} />
      {fixedFocus && <input type="hidden" name="focus" value={encodeQuizFocus(fixedFocus)} />}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Difficulty</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DIFFICULTIES.map((difficulty) => (
            <label key={difficulty} className={cn(choiceClasses, "flex-col gap-0.5")}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="difficulty"
                  value={difficulty}
                  defaultChecked={difficulty === selectedDifficulty}
                  className="sr-only"
                />
                {DIFFICULTY_LABELS[difficulty]}
              </span>
              <span className="text-xs text-muted">{DIFFICULTY_DESCRIPTIONS[difficulty]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Length</legend>
          <div className="flex gap-2">
            {QUESTION_COUNT_OPTIONS.map((count) => (
              <label key={count} className={cn(choiceClasses, "text-sm font-medium")}>
                <input
                  type="radio"
                  name="questionCount"
                  value={count}
                  defaultChecked={String(count) === selectedCount}
                  className="sr-only"
                />
                {count} questions
              </label>
            ))}
          </div>
        </fieldset>

        {focusOptions && focusOptions.length > 0 && !fixedFocus && (
          <div className="min-w-48 flex-1">
            <label htmlFor={`focus-${topicId}`} className="mb-2 block text-sm font-medium">
              Focus on
            </label>
            <select
              id={`focus-${topicId}`}
              name="focus"
              defaultValue={values.focus ?? ""}
              className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm"
            >
              <option value="">My weak spots (recommended)</option>
              {focusOptions.map((subtopic) => (
                <optgroup key={subtopic.id} label={subtopic.name}>
                  <option value={encodeQuizFocus({ kind: "subtopic", id: subtopic.id })}>
                    Whole subtopic: {subtopic.name}
                  </option>
                  {subtopic.concepts.map((concept) => (
                    <option
                      key={concept.id}
                      value={encodeQuizFocus({ kind: "concept", id: concept.id })}
                    >
                      {concept.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
      </div>

      {state && !state.ok && <Alert>{state.error}</Alert>}

      <div className="space-y-2">
        <SubmitButton pendingLabel="Writing your quiz…" size="lg">
          Start quiz
        </SubmitButton>
        <p className="text-sm text-muted" aria-live="polite">
          {pending ? "Claude is writing questions. This usually takes 20 to 60 seconds." : ""}
        </p>
      </div>
    </form>
  );
}
