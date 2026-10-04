"use client";

import { useFormAction } from "@/components/hooks/use-form-action";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { SUBTOPIC_NAME_MAX_LENGTH, SUBTOPIC_NOTES_MAX_LENGTH } from "@/domain/input-schemas";
import { addSubtopicAction } from "@/server/actions/subtopic-actions";

const inputClasses =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-ink placeholder:text-muted " +
  "focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

export function AddSubtopicForm({ topicId }: { topicId: string }) {
  const { result, values, formAction, pending } = useFormAction(addSubtopicAction);
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="topicId" value={topicId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <div className="space-y-1.5">
          <label htmlFor="subtopic-name" className="text-sm font-medium">
            Subtopic
          </label>
          <input
            id="subtopic-name"
            name="name"
            defaultValue={values.name}
            required
            minLength={2}
            maxLength={SUBTOPIC_NAME_MAX_LENGTH}
            placeholder="e.g. Node.js event loop phases"
            autoComplete="off"
            className={inputClasses}
            aria-invalid={Boolean(fieldErrors?.name)}
            aria-describedby={fieldErrors?.name ? "subtopic-name-error" : undefined}
          />
          {fieldErrors?.name && (
            <p id="subtopic-name-error" className="text-sm text-danger">
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="subtopic-notes" className="text-sm font-medium">
            What should it cover? <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="subtopic-notes"
            name="notes"
            defaultValue={values.notes}
            maxLength={SUBTOPIC_NOTES_MAX_LENGTH}
            placeholder="e.g. setImmediate vs process.nextTick, libuv phases"
            autoComplete="off"
            className={inputClasses}
            aria-invalid={Boolean(fieldErrors?.notes)}
            aria-describedby={fieldErrors?.notes ? "subtopic-notes-error" : undefined}
          />
          {fieldErrors?.notes && (
            <p id="subtopic-notes-error" className="text-sm text-danger">
              {fieldErrors.notes}
            </p>
          )}
        </div>
      </div>

      {result && !result.ok && !fieldErrors && <Alert>{result.error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Adding subtopic…">Add subtopic</SubmitButton>
        <p className="text-sm text-muted" aria-live="polite">
          {pending
            ? "Claude is breaking it into concepts. This usually takes 10 to 30 seconds."
            : ""}
        </p>
      </div>
    </form>
  );
}
