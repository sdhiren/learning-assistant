import type { ReactNode } from "react";

export const inputClasses =
  "w-full rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-ink placeholder:text-muted " +
  "focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

/** A labelled form field with its validation error underneath. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
