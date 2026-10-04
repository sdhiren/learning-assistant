"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/lib/action-result";

type FormAction<T> = (
  previous: ActionResult<T> | null,
  formData: FormData,
) => Promise<ActionResult<T>>;

interface FormActionState<T> {
  result: ActionResult<T>;
  /** The text values that were submitted, keyed by field name. */
  values: Partial<Record<string, string>>;
}

/**
 * useActionState for forms that must keep the user's input after a failed
 * submission. React resets uncontrolled fields whenever a form action runs;
 * rendering inputs with `defaultValue={values.field}` makes that reset
 * restore what the user submitted instead of clearing it.
 */
export function useFormAction<T>(action: FormAction<T>) {
  const [state, formAction, pending] = useActionState(
    async (previous: FormActionState<T> | null, formData: FormData) => ({
      result: await action(previous?.result ?? null, formData),
      values: textValues(formData),
    }),
    null,
  );

  return {
    result: state?.result ?? null,
    values: state?.values ?? {},
    formAction,
    pending,
  };
}

function textValues(formData: FormData): Partial<Record<string, string>> {
  const values: Partial<Record<string, string>> = {};
  for (const [name, value] of formData) {
    if (typeof value === "string") values[name] = value;
  }
  return values;
}
