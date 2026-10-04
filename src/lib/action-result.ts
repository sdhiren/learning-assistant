/** The serialisable outcome of a server action, consumed by client forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(
  error: string,
  fieldErrors?: Partial<Record<string, string>>,
): ActionResult<never> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}
