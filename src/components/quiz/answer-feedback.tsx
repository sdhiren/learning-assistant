import { CodeBlock } from "@/components/ui/code-block";
import { InlineCodeText } from "@/components/ui/inline-code-text";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { AnswerResultView } from "@/server/services/view-models";

interface AnswerFeedbackProps {
  result: AnswerResultView;
  /** Multiple-choice questions already highlight the correct option. */
  showCorrectAnswer: boolean;
  /**
   * How to show the correct answer: prose, program output (verbatim), or a
   * reference solution highlighted in `codeLanguage`.
   */
  correctAnswerFormat: "prose" | "output" | "solution";
  codeLanguage?: string | null;
}

const TONE_CLASSES = {
  correct: { container: "border-success/40 bg-success-soft", heading: "text-success" },
  incorrect: { container: "border-danger/40 bg-danger-soft", heading: "text-danger" },
  skipped: { container: "border-border bg-surface-muted", heading: "text-muted" },
} as const;

const TONE_ICONS = { correct: "✓", incorrect: "✗", skipped: "→" } as const;

export function AnswerFeedback({
  result,
  showCorrectAnswer,
  correctAnswerFormat,
  codeLanguage,
}: AnswerFeedbackProps) {
  const isPartial = result.isCorrect && result.score < 1;
  const tone = result.skipped ? "skipped" : result.isCorrect ? "correct" : "incorrect";
  const heading = result.skipped
    ? "Skipped"
    : result.isCorrect
      ? isPartial
        ? "Mostly correct"
        : "Correct"
      : "Not quite";

  return (
    <section
      aria-live="polite"
      aria-label="Feedback"
      className={cn("animate-pop space-y-4 rounded-xl border p-5", TONE_CLASSES[tone].container)}
    >
      <p className={cn("flex items-center gap-2 font-semibold", TONE_CLASSES[tone].heading)}>
        <span aria-hidden="true">{TONE_ICONS[tone]}</span>
        {heading}
        {!result.skipped && (
          <span className="text-sm font-normal text-muted">
            · score {formatPercent(result.score)}
          </span>
        )}
      </p>

      {result.feedback && (
        <p className="text-sm leading-relaxed whitespace-pre-line text-ink">
          <InlineCodeText text={result.feedback} />
        </p>
      )}

      {showCorrectAnswer && (
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-ink">
            {correctAnswerFormat === "solution"
              ? "Reference solution"
              : result.skipped
                ? "Answer"
                : "Model answer"}
          </h2>
          {correctAnswerFormat === "prose" ? (
            <p className="text-sm leading-relaxed whitespace-pre-line text-ink">
              <InlineCodeText text={result.correctAnswer} />
            </p>
          ) : (
            <CodeBlock
              code={result.correctAnswer}
              language={correctAnswerFormat === "solution" ? (codeLanguage ?? "text") : "text"}
            />
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <h2 className="text-sm font-semibold text-ink">Why</h2>
        <p className="text-sm leading-relaxed whitespace-pre-line text-ink">
          <InlineCodeText text={result.explanation} />
        </p>
      </div>
    </section>
  );
}
