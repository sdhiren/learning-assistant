"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

import { MonitorIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

import { applyTheme, readThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "./theme";

const OPTIONS = [
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "system", label: "Match system theme", Icon: MonitorIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
] as const satisfies readonly { value: ThemePreference; label: string; Icon: unknown }[];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies now.
  }
  applyTheme(preference);
  listeners.forEach((listener) => listener());
}

/** Light / system / dark switch. The no-flash inline script lives in layout.tsx. */
export function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, readThemePreference, () => "system");

  // React's dev Strict Mode remount clears the attribute the inline script set.
  useLayoutEffect(() => applyTheme(readThemePreference()), []);

  // Follow the OS theme live while "system" is selected.
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("system");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preference]);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center rounded-full border border-border bg-surface-muted p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-all",
              selected ? "bg-surface text-accent shadow-card" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
