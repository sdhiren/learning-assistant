"use client";

import { useRef } from "react";

import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { GenerationProgress } from "@/components/ui/generation-progress";
import { SubmitButton } from "@/components/ui/submit-button";
import { TOPIC_GOAL_MAX_LENGTH, TOPIC_NAME_MAX_LENGTH } from "@/domain/input-schemas";
import { createTopicAction } from "@/server/actions/topic-actions";

const inputClasses =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-ink placeholder:text-muted " +
  "focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

/** One click fills the topic field, so a first topic is easy to start. */
const SUGGESTIONS = [
  "System design: rate limiters",
  "React performance",
  "PostgreSQL indexing",
  "Kubernetes networking",
  "JavaScript event loop",
  "Python concurrency",
];

export function CreateTopicForm() {
  const { result: state, values, formAction, pending } = useFormAction(createTopicAction);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const nameRef = useRef<HTMLInputElement>(null);

  function applySuggestion(suggestion: string) {
    if (!nameRef.current) return;
    nameRef.current.value = suggestion;
    nameRef.current.focus();
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6"
      aria-busy={pending}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <div className="space-y-1.5">
          <label htmlFor="topic-name" className="text-sm font-medium">
            Topic
          </label>
          <input
            ref={nameRef}
            id="topic-name"
            name="name"
            defaultValue={values.name}
            required
            minLength={2}
            maxLength={TOPIC_NAME_MAX_LENGTH}
            placeholder="e.g. PostgreSQL indexing"
            autoComplete="off"
            className={inputClasses}
            aria-invalid={Boolean(fieldErrors?.name)}
            aria-describedby={fieldErrors?.name ? "topic-name-error" : undefined}
          />
          {fieldErrors?.name && (
            <p id="topic-name-error" className="text-sm text-danger">
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="topic-goal" className="text-sm font-medium">
            Your goal <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="topic-goal"
            name="goal"
            defaultValue={values.goal}
            maxLength={TOPIC_GOAL_MAX_LENGTH}
            placeholder="e.g. Senior backend interview, focus on query performance"
            autoComplete="off"
            className={inputClasses}
            aria-invalid={Boolean(fieldErrors?.goal)}
            aria-describedby={fieldErrors?.goal ? "topic-goal-error" : undefined}
          />
          {fieldErrors?.goal && (
            <p id="topic-goal-error" className="text-sm text-danger">
              {fieldErrors.goal}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Try:</span>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => applySuggestion(suggestion)}
            disabled={pending}
            className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-muted transition-all hover:-translate-y-px hover:border-accent/50 hover:text-accent disabled:opacity-60"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {state && !state.ok && !fieldErrors && <Alert>{state.error}</Alert>}

      <SubmitButton pendingLabel="Building your skill map…">Create topic</SubmitButton>
      {pending && (
        <GenerationProgress
          message="Claude is designing your skill map"
          expected="15 to 40 seconds"
        />
      )}
    </form>
  );
}
