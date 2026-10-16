"use client";

import { useEffect, useRef } from "react";

export interface QuizShortcutHandlers {
  /** Number of multiple-choice options, or 0 for typed answers. */
  optionCount: number;
  answered: boolean;
  onSelectOption: (index: number) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onNext: () => void;
  onPrevious: (() => void) | null;
}

/** True when keys typed here belong to a text field, not to the quiz. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["radio", "checkbox"].includes(target.type);
}

/**
 * Keyboard shortcuts for a question:
 * 1–4 or A–D choose an option, Enter submits a choice, S skips,
 * N or → goes to the next question once answered, ← goes back.
 */
export function useQuizShortcuts(handlers: QuizShortcutHandlers): void {
  // Read the latest handlers without re-subscribing on every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      const current = handlersRef.current;
      const key = event.key.toLowerCase();
      const target = event.target;
      // Leave native behaviour alone: Enter activates a focused button or
      // link, and arrow keys move between radio options.
      if (
        key === "enter" &&
        (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement)
      ) {
        return;
      }
      if (key.startsWith("arrow") && target instanceof HTMLInputElement) return;

      if (current.answered) {
        if (key === "n" || key === "arrowright") {
          event.preventDefault();
          current.onNext();
        } else if (key === "arrowleft" && current.onPrevious) {
          event.preventDefault();
          current.onPrevious();
        }
        return;
      }

      const optionIndex = /^[1-9]$/.test(key)
        ? Number(key) - 1
        : /^[a-i]$/.test(key)
          ? key.charCodeAt(0) - "a".charCodeAt(0)
          : -1;
      if (optionIndex >= 0 && optionIndex < current.optionCount) {
        event.preventDefault();
        current.onSelectOption(optionIndex);
      } else if (key === "enter" && current.optionCount > 0) {
        event.preventDefault();
        current.onSubmit();
      } else if (key === "s") {
        event.preventDefault();
        current.onSkip();
      } else if (key === "arrowleft" && current.onPrevious) {
        event.preventDefault();
        current.onPrevious();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
