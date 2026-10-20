"use client";

import { useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

interface CodeEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Called on ⌘/Ctrl + Enter. */
  onSubmit: () => void;
  readOnly: boolean;
  disabled: boolean;
  maxLength: number;
  describedBy: string;
  /** The text Tab inserts; see detectIndent. */
  indent: string;
}

/**
 * A plain monospace editor for coding challenges. Tab indents instead of
 * moving focus; to keep the page keyboard-accessible, pressing Esc first
 * lets the next Tab leave the editor as usual.
 */
export function CodeEditor({
  id,
  value,
  onChange,
  onSubmit,
  readOnly,
  disabled,
  maxLength,
  describedBy,
  indent,
}: CodeEditorProps) {
  const releaseFocusRef = useRef(false);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
      return;
    }
    if (event.key === "Escape") {
      releaseFocusRef.current = true;
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !releaseFocusRef.current && !readOnly) {
      event.preventDefault();
      insertIndent(event.currentTarget);
      return;
    }
    releaseFocusRef.current = false;
  }

  function insertIndent(textarea: HTMLTextAreaElement) {
    const { selectionStart, selectionEnd } = textarea;
    const next = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
    if (next.length > maxLength) return;
    onChange(next);
    // Restore the caret after React re-renders the controlled value.
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = selectionStart + indent.length;
    });
  }

  const lineCount = value.split("\n").length;

  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      readOnly={readOnly}
      disabled={disabled}
      maxLength={maxLength}
      rows={Math.min(24, Math.max(10, lineCount + 2))}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      wrap="off"
      aria-describedby={describedBy}
      className={cn(
        "w-full rounded-lg border border-border-strong bg-code-bg px-4 py-3 font-mono text-sm",
        "leading-relaxed [tab-size:2] text-code-ink",
        "focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
      )}
    />
  );
}
