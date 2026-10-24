"use client";

import { useState, type TextareaHTMLAttributes } from "react";

import { useAiProvider } from "@/components/ai-provider-context";
import { INSTRUCTIONS_MAX_LENGTH } from "@/domain/input-schemas";

interface InstructionsFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  /** Example shown as the placeholder. */
  example: string;
}

/**
 * Optional learner instructions for Claude, collapsed by default. The field
 * still submits with its form while collapsed.
 */
export function InstructionsField({
  id,
  example,
  defaultValue,
  value,
  ...props
}: InstructionsFieldProps) {
  // Start open when there's already text (e.g. after a failed submit), then let the learner decide.
  const [open, setOpen] = useState(() => Boolean(value ?? defaultValue));
  const { label } = useAiProvider();

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-accent select-none hover:underline">
        Add instructions for {label} <span className="font-normal text-muted">(optional)</span>
      </summary>
      <div className="mt-2 space-y-1.5">
        <label htmlFor={id} className="sr-only">
          Instructions for {label}
        </label>
        <textarea
          id={id}
          name="instructions"
          rows={2}
          maxLength={INSTRUCTIONS_MAX_LENGTH}
          placeholder={example}
          defaultValue={defaultValue}
          value={value}
          className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          {...props}
        />
        <p className="text-xs text-muted">
          A preference, not an override: {label} still follows its usual rules for accuracy and
          format.
        </p>
      </div>
    </details>
  );
}
