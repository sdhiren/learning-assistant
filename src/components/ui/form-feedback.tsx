"use client";

import { useState, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

import { Alert } from "./alert";

interface FormFeedbackProps {
  result: ActionResult<unknown> | null;
  pending: boolean;
  /** True when the form was edited after its last submission. */
  dirty: boolean;
  /** Shown after a successful save, e.g. "Your details are saved." */
  successMessage: string;
}

/**
 * The status line next to a form's submit button: a clear success message
 * after saving, the error (including the "fix the highlighted fields"
 * summary) after a failure, and "Unsaved changes" once the learner edits the
 * form again, so a stale "saved" message never lingers.
 */
export function FormFeedback({ result, pending, dirty, successMessage }: FormFeedbackProps) {
  if (pending) return null;
  if (dirty) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
        Unsaved changes
      </p>
    );
  }
  if (!result) return null;
  return result.ok ? <Alert tone="success">{successMessage}</Alert> : <Alert>{result.error}</Alert>;
}

/**
 * Tracks whether a form was edited after its latest result, without effects:
 * an edit records the result it happened after, so a new submission (which
 * produces a new result object) clears the dirty state by itself.
 */
export function useDirtySince(result: ActionResult<unknown> | null) {
  const [editedAfter, setEditedAfter] = useState<ActionResult<unknown> | null | undefined>(
    undefined,
  );
  return {
    dirty: editedAfter === result,
    markDirty: () => setEditedAfter(result),
    /** For a form's onChange: counts edits to named fields only, not helper inputs. */
    onFormChange: (event: FormEvent<HTMLFormElement>) => {
      const target = event.target as HTMLInputElement;
      if (target.name) setEditedAfter(result);
    },
  };
}
