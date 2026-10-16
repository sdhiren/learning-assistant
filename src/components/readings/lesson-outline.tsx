"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import type { OutlineHeading } from "@/lib/lesson-outline";

/** The lesson's sections, highlighting the one being read. */
export function LessonOutline({ headings }: { headings: readonly OutlineHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element) => element !== null);
    if (elements.length === 0) return;

    // A section counts as "current" once its heading passes the top third of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0]!.target.id);
      },
      { rootMargin: "-80px 0px -66% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Lesson contents" className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">In this lesson</p>
      <ol className="space-y-0.5 border-l border-border">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1 pl-3 text-sm transition-colors",
                  active
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-muted hover:border-border-strong hover:text-ink",
                )}
              >
                {heading.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
