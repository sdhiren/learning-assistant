import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { AnswerResultView } from "@/server/services/view-models";

interface AnswerFeedbackProps {
  result: AnswerResultView;
  /** Multiple-choice questions already highlight the correct option. */
  showCorrectAnswer: boolean;
}

export function AnswerFeedback({ result, showCorrectAnswer }: AnswerFeedbackProps) {
  const isPartial = result.isCorrect && result.score < 1;

  return (
    <section
      aria-live="polite"
      aria-label="Feedback"
      className={cn(
        "space-y-4 rounded-xl border p-5",
        result.isCorrect ? "border-success/40 bg-success-soft" : "border-danger/40 bg-danger-soft",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 font-semibold",
          result.isCorrect ? "text-success" : "text-danger",
        )}
      >
        <span aria-hidden="true">{result.isCorrect ? "✓" : "✗"}</span>
        {result.isCorrect ? (isPartial ? "Mostly correct" : "Correct") : "Not quite"}
        <span className="text-sm font-normal text-muted">
          · score {formatPercent(result.score)}
        </span>
      </p>

      {result.feedback && (
        <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{result.feedback}</p>
      )}

      {showCorrectAnswer && (
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-ink">Model answer</h2>
          {result.correctAnswer.includes("\n") ? (
            <CodeBlock code={result.correctAnswer} />
          ) : (
            <p className="text-sm leading-relaxed text-ink">{result.correctAnswer}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <h2 className="text-sm font-semibold text-ink">Why</h2>
        <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{result.explanation}</p>
      </div>
    </section>
  );
}
