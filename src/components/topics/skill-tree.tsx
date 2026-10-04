import Link from "next/link";

import { ConceptList } from "@/components/topics/concept-list";
import { buttonClasses } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatPercent } from "@/lib/format";
import type { SubtopicView } from "@/server/services/view-models";

interface SkillTreeProps {
  topicId: string;
  subtopics: readonly SubtopicView[];
}

/** The topic's curriculum, subtopic by subtopic, with mastery for each concept. */
export function SkillTree({ topicId, subtopics }: SkillTreeProps) {
  return (
    <section aria-labelledby="skill-map-heading" className="space-y-4">
      <div>
        <h2 id="skill-map-heading" className="text-lg font-semibold">
          Skill map
        </h2>
        <p className="text-sm text-muted">
          Quiz on a whole subtopic, or open a concept to read a lesson or drill it.
        </p>
      </div>
      <ol className="space-y-4">
        {subtopics.map((subtopic, index) => {
          const href = `/topics/${topicId}/subtopics/${subtopic.id}`;
          return (
            <li key={subtopic.id} className="rounded-2xl border border-border bg-surface">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-3">
                <h3 className="flex min-w-0 flex-1 items-center gap-3 font-medium">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-muted font-mono text-xs text-muted">
                    {index + 1}
                  </span>
                  <Link href={href} className="hover:text-accent hover:underline">
                    {subtopic.name}
                  </Link>
                  {subtopic.origin === "learner" && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-accent">
                      Added by you
                    </span>
                  )}
                </h3>
                <span className="flex items-center gap-3">
                  <span className="w-24">
                    <ProgressBar value={subtopic.progress} label={`${subtopic.name} progress`} />
                  </span>
                  <span className="w-10 text-right text-xs text-muted tabular-nums">
                    {formatPercent(subtopic.progress)}
                  </span>
                  <Link
                    href={href}
                    className={buttonClasses("secondary", "sm")}
                    aria-label={`Quiz on ${subtopic.name}`}
                  >
                    Quiz
                  </Link>
                </span>
              </div>
              <ConceptList topicId={topicId} concepts={subtopic.concepts} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
