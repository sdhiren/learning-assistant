import type { Metadata } from "next";
import { connection } from "next/server";
import { cache } from "react";

import { GenerateReadingButton } from "@/components/readings/generate-reading-button";
import { LessonOutline } from "@/components/readings/lesson-outline";
import { ReadingContent } from "@/components/readings/reading-content";
import { ReadingProgress } from "@/components/readings/reading-progress";
import { StartQuizForm } from "@/components/topics/start-quiz-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardTitle } from "@/components/ui/card";
import { BookIcon } from "@/components/ui/icons";
import { MasteryBadge } from "@/components/ui/mastery-badge";
import { formatPercent, formatRelativeDate } from "@/lib/format";
import { extractOutline } from "@/lib/lesson-outline";
import { getAiProviderInfo, getServices } from "@/server/container";
import { orNotFound } from "@/server/or-not-found";

type ConceptPageProps = PageProps<"/topics/[topicId]/concepts/[conceptId]">;

const WORDS_PER_MINUTE = 220;

function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(markdown.split(/\s+/).length / WORDS_PER_MINUTE));
}

/** Loads the reading once per request; shared by the metadata and the page. */
const loadReading = cache(async (topicId: string, conceptId: string) => {
  await connection();
  return orNotFound(() => getServices().readings.getReading(topicId, conceptId));
});

export async function generateMetadata(props: ConceptPageProps): Promise<Metadata> {
  const { topicId, conceptId } = await props.params;
  const reading = await loadReading(topicId, conceptId);
  return { title: `${reading.conceptName} · ${reading.topicName}` };
}

export default async function ConceptPage(props: ConceptPageProps) {
  const { topicId, conceptId } = await props.params;
  const reading = await loadReading(topicId, conceptId);
  const { mastery } = reading;
  const outline = reading.content ? extractOutline(reading.content.markdown) : [];

  return (
    <div className="space-y-8">
      {reading.content && <ReadingProgress targetId="lesson" />}
      <div className="animate-fade-up">
        <Breadcrumbs
          items={[
            { label: "Topics", href: "/" },
            { label: reading.topicName, href: `/topics/${reading.topicId}` },
            {
              label: reading.subtopicName,
              href: `/topics/${reading.topicId}/subtopics/${reading.subtopicId}`,
            },
            { label: reading.conceptName },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {reading.conceptName}
        </h1>
        <p className="mt-2 max-w-3xl text-muted">{reading.conceptSummary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <MasteryBadge level={mastery.level} />
          {mastery.score !== null && (
            <span>
              {formatPercent(mastery.score)} across {mastery.attemptCount}{" "}
              {mastery.attemptCount === 1 ? "answer" : "answers"}
            </span>
          )}
          {reading.content && (
            <span className="flex items-center gap-1.5">
              <BookIcon className="size-3.5" />
              {readingMinutes(reading.content.markdown)} min read
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article
          id="lesson"
          aria-label="Lesson"
          className="animate-fade-up rounded-2xl border border-border bg-surface p-5 shadow-card [animation-delay:80ms] sm:p-8"
        >
          {reading.content ? (
            <>
              <ReadingContent
                markdown={reading.content.markdown}
                keyTakeaways={reading.content.keyTakeaways}
              />
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted">
                <div className="space-y-1">
                  <p>Written {formatRelativeDate(reading.content.createdAt)}</p>
                  {reading.content.instructions && (
                    <p>
                      <span className="font-medium text-ink">Your instructions:</span>{" "}
                      {reading.content.instructions}
                    </p>
                  )}
                </div>
                <GenerateReadingButton
                  topicId={reading.topicId}
                  conceptId={reading.conceptId}
                  hasReading
                />
              </div>
            </>
          ) : (
            <div className="space-y-4 py-6 text-center">
              <h2 className="text-lg font-semibold">No lesson yet</h2>
              <p className="mx-auto max-w-md text-muted">
                {getAiProviderInfo().label} will write a short, interview-focused lesson on this
                concept: how it works, pitfalls and how interviewers probe it.
              </p>
              <GenerateReadingButton topicId={reading.topicId} conceptId={reading.conceptId} />
            </div>
          )}
        </article>

        <div className="space-y-6 lg:sticky lg:top-20">
          {outline.length > 0 && (
            <div className="hidden rounded-2xl border border-border bg-surface p-5 shadow-card lg:block">
              <LessonOutline headings={outline} />
            </div>
          )}
          <Card aria-labelledby="drill-heading">
            <CardTitle id="drill-heading">Drill this concept</CardTitle>
            <p className="mt-1 mb-5 text-sm text-muted">
              Every question targets {reading.conceptName}.
            </p>
            <StartQuizForm
              topicId={reading.topicId}
              fixedFocus={{ kind: "concept", id: reading.conceptId }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
