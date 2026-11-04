"use client";

import { useState, type KeyboardEvent } from "react";

import { INTEREST_CATALOG } from "@/domain/interests";
import { INTEREST_MAX_LENGTH, MAX_INTERESTS } from "@/domain/input-schemas";
import { cn } from "@/lib/cn";

import { inputClasses } from "./field";

/**
 * Catalog chips plus free text. Each chosen interest is submitted as its own
 * `interests` field, so the action reads them with `formData.getAll`.
 */
export function InterestPicker({
  initial = [],
  error,
  onChange,
}: {
  initial?: string[];
  error?: string;
  /** Called when the selection changes (chips are buttons, so no change event fires). */
  onChange?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const full = selected.length >= MAX_INTERESTS;

  const has = (value: string) =>
    selected.some((item) => item.toLowerCase() === value.toLowerCase());

  function toggle(value: string) {
    if (!has(value) && full) return;
    onChange?.();
    setSelected((current) =>
      has(value)
        ? current.filter((item) => item.toLowerCase() !== value.toLowerCase())
        : current.length < MAX_INTERESTS
          ? [...current, value]
          : current,
    );
  }

  function addDraft() {
    const value = draft.trim();
    if (value && !has(value) && !full) {
      onChange?.();
      setSelected((current) => [...current, value]);
    }
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraft();
    }
  }

  const custom = selected.filter(
    (item) => !INTEREST_CATALOG.some((option) => option.toLowerCase() === item.toLowerCase()),
  );

  return (
    <fieldset className="space-y-2.5" aria-describedby={error ? "interests-error" : undefined}>
      <legend className="text-sm font-medium">
        Interests{" "}
        <span className="font-normal text-muted">
          ({selected.length}/{MAX_INTERESTS})
        </span>
      </legend>
      {selected.map((item) => (
        <input key={item} type="hidden" name="interests" value={item} />
      ))}
      <div className="flex flex-wrap gap-2">
        {[...INTEREST_CATALOG, ...custom].map((option) => {
          const active = has(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(option)}
              disabled={!active && full}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all disabled:opacity-50",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-border bg-surface-muted text-muted hover:border-accent/50 hover:text-accent",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <label htmlFor="interest-draft" className="sr-only">
          Add your own interest
        </label>
        <input
          id="interest-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={INTEREST_MAX_LENGTH}
          disabled={full}
          placeholder="Add your own, e.g. Kafka"
          autoComplete="off"
          className={inputClasses}
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={full || !draft.trim()}
          className="shrink-0 rounded-lg border border-border-strong px-4 text-sm font-medium disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && (
        <p id="interests-error" className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
