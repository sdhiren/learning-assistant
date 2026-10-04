"use client";

import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TOPIC_GOAL_MAX_LENGTH, TOPIC_NAME_MAX_LENGTH } from "@/domain/input-schemas";
import { createTopicAction } from "@/server/actions/topic-actions";

const inputClasses =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-ink placeholder:text-muted " +
  "focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

export function CreateTopicForm() {
  const { result: state, values, formAction, pending } = useFormAction(createTopicAction);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6"
      aria-busy={pending}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <div className="space-y-1.5">
          <label htmlFor="topic-name" className="text-sm font-medium">
            Topic
          </label>
          <input
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

      {state && !state.ok && !fieldErrors && <Alert>{state.error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Building your skill map…">Create topic</SubmitButton>
        <p className="text-sm text-muted" aria-live="polite">
          {pending
            ? "Claude is designing the curriculum. This usually takes 15 to 40 seconds."
            : ""}
        </p>
      </div>
    </form>
  );
}
