import { KeyboardIcon } from "@/components/ui/icons";

/** A quiet line of keyboard shortcuts, hidden on touch-only screens. */
export function ShortcutHint({
  keys,
}: {
  keys: readonly (readonly [key: string, action: string])[];
}) {
  return (
    <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted pointer-fine:flex">
      <KeyboardIcon className="size-3.5" />
      {keys.map(([key, action]) => (
        <span key={key} className="flex items-center gap-1">
          <kbd className="rounded border border-border-strong/60 bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink">
            {key}
          </kbd>
          {action}
        </span>
      ))}
    </p>
  );
}
