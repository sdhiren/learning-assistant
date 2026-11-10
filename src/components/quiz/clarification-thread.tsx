"use client";

import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { useAiProvider } from "@/components/ai-provider-context";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InlineCodeText } from "@/components/ui/inline-code-text";
import { Spinner } from "@/components/ui/spinner";
import { CLARIFICATION_MAX_LENGTH, MAX_CLARIFICATIONS_PER_QUESTION } from "@/domain/input-schemas";
import { cn } from "@/lib/cn";
import { askClarificationAction } from "@/server/actions/quiz-actions";
import type { ClarificationView } from "@/server/services/view-models";

const BEFORE_ANSWER_SUGGESTIONS = [
  "What does this question mean?",
  "How detailed should my answer be?",
];
const AFTER_ANSWER_SUGGESTIONS = [
  "Why is the model answer better than mine?",
  "Explain this more simply",
  "Give me another example",
];

interface ClarificationThreadProps {
  questionId: string;
  /** Answered or skipped: the AI can now discuss the answer. */
  answered: boolean;
  clarifications: ClarificationView[];
  onAdded: (items: ClarificationView[]) => void;
  /** Unsent follow-up text, kept by the player across navigation. */
  draft: string;
  onDraftChange: (value: string) => void;
}

/**
 * Follow-up questions about a quiz question. Before answering it is a
 * collapsed "Unclear?" box that explains the question without giving the
 * answer; afterwards it discusses the answer. The server decides which.
 */
export function ClarificationThread({
  questionId,
  answered,
  clarifications,
  onAdded,
  draft,
  onDraftChange,
}: ClarificationThreadProps) {
  const { label } = useAiProvider();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(clarifications.length > 0 || draft.length > 0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  const asked = clarifications.filter((message) => message.role === "learner").length;
  const limitReached = asked >= MAX_CLARIFICATIONS_PER_QUESTION;
  const canSend = draft.trim().length > 0 && !pending && !limitReached;

  function send(message = draft) {
    if (!message.trim() || pending || limitReached) return;
    setError(null);
    startTransition(async () => {
      const response = await askClarificationAction({ questionId, message });
      if (response.ok) {
        onAdded(response.data);
        onDraftChange("");
        // Keep focus here, so a reply never moves it to the answer box or Next.
        inputRef.current?.focus();
      } else {
        setError(response.error);
      }
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      // Sends the follow-up only; never submits the quiz answer.
      event.preventDefault();
      event.stopPropagation();
      send();
    }
  }

  const suggestions = answered ? AFTER_ANSWER_SUGGESTIONS : BEFORE_ANSWER_SUGGESTIONS;
  const body = (
    <div className="space-y-3">
      {clarifications.length > 0 && (
        <ol className="space-y-2" aria-live="polite" aria-label="Follow-up conversation">
          {clarifications.map((message) => (
            <li
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line",
                message.role === "learner"
                  ? "ml-auto bg-surface-muted text-muted"
                  : "border border-border bg-surface",
              )}
            >
              <span className="sr-only">{message.role === "learner" ? "You: " : `${label}: `}</span>
              <InlineCodeText text={message.content} />
            </li>
          ))}
        </ol>
      )}

      {limitReached ? (
        <p className="text-xs text-muted">
          You&apos;ve asked {MAX_CLARIFICATIONS_PER_QUESTION} follow-ups about this question, the
          most allowed per question.
        </p>
      ) : (
        <div className="space-y-2">
          {clarifications.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    onDraftChange(suggestion);
                    send(suggestion);
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          )}
          <label htmlFor={inputId} className="sr-only">
            {answered ? "Ask a follow-up" : "Ask about this question"}
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            // Read-only rather than disabled while sending, so focus stays here.
            readOnly={pending}
            maxLength={CLARIFICATION_MAX_LENGTH}
            rows={2}
            placeholder={
              answered
                ? "e.g. What numbers should I have given?"
                : "e.g. What does “pin down” mean here?"
            }
            className={
              "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink " +
              "focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => send()} disabled={!canSend}>
              {pending && <Spinner />}
              Ask
            </Button>
            <span className="text-xs text-muted" aria-live="polite">
              {pending
                ? `${label} is thinking…`
                : `⌘/Ctrl + Enter sends. ${MAX_CLARIFICATIONS_PER_QUESTION - asked} left for this question.`}
            </span>
          </div>
        </div>
      )}

      {error && <Alert>{error}</Alert>}
    </div>
  );

  if (answered) {
    return (
      <section
        className="space-y-3 rounded-xl border border-border p-4"
        aria-label="Ask a follow-up"
      >
        <h2 className="text-sm font-semibold">Ask a follow-up</h2>
        {body}
      </section>
    );
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-xl border border-border p-4"
    >
      <summary className="cursor-pointer text-sm font-medium">
        Unclear? Ask about this question
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted">
          {label} can explain what the question asks. This won&apos;t give you the answer, and it
          won&apos;t affect your score.
        </p>
        {body}
      </div>
    </details>
  );
}
