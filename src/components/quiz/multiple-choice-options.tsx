"use client";

import { cn } from "@/lib/cn";
import type { AnswerResultView } from "@/server/services/view-models";

interface MultipleChoiceOptionsProps {
  questionId: string;
  options: readonly string[];
  /** The selected option index, as a string ("" when nothing is selected). */
  value: string;
  onChange: (value: string) => void;
  /** Once answered, options are coloured to show the correct one. */
  result: AnswerResultView | null;
  disabled: boolean;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export function MultipleChoiceOptions({
  questionId,
  options,
  value,
  onChange,
  result,
  disabled,
}: MultipleChoiceOptionsProps) {
  return (
    <fieldset>
      <legend className="sr-only">Choose one answer</legend>
      <div className="space-y-2.5">
        {options.map((option, index) => {
          const optionValue = String(index);
          const isSelected = value === optionValue;
          const isCorrectOption = result !== null && option === result.correctAnswer;
          const isWrongSelection = result !== null && isSelected && !result.isCorrect;

          return (
            <label
              key={optionValue}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                !result && "cursor-pointer hover:border-accent/60",
                !result && isSelected && "border-accent bg-accent-soft",
                !result && !isSelected && "border-border-strong",
                isCorrectOption && "border-success bg-success-soft",
                isWrongSelection && "border-danger bg-danger-soft",
                result && !isCorrectOption && !isWrongSelection && "border-border opacity-70",
                "has-focus-visible:outline-2 has-focus-visible:outline-accent",
              )}
            >
              <input
                type="radio"
                name={`question-${questionId}`}
                value={optionValue}
                checked={isSelected}
                onChange={() => onChange(optionValue)}
                disabled={disabled}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-md border font-mono text-xs",
                  isSelected
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border-strong text-muted",
                )}
              >
                {OPTION_LETTERS[index]}
              </span>
              <span className="text-sm leading-relaxed whitespace-pre-line">{option}</span>
              {isCorrectOption && <span className="sr-only"> (correct answer)</span>}
              {isWrongSelection && <span className="sr-only"> (your answer, incorrect)</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
