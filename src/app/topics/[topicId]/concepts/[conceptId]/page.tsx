import type { Metadata } from "next";
import { connection } from "next/server";
import { cache } from "react";

import { GenerateReadingButton } from "@/components/readings/generate-reading-button";
import { ReadingContent } from "@/components/readings/reading-content";
import { StartQuizForm } from "@/components/topics/start-quiz-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardTitle } from "@/components/ui/card";
import { MasteryBadge } from "@/components/ui/mastery-badge";
import { formatPercent, formatRelativeDate } from "@/lib/format";
import { getServices } from "@/server/container";
import { orNotFound } from "@/server/or-not-found";

type ConceptPageProps = PageProps<"/topics/[topicId]/concepts/[conceptId]">;

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

  return (
    <div className="space-y-8">
      <div>
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
        <div className="mt-3 flex items-center gap-3 text-sm text-muted">
          <MasteryBadge level={mastery.level} />
          {mastery.score !== null && (
            <span>
              {formatPercent(mastery.score)} across {mastery.attemptCount}{" "}
              {mastery.attemptCount === 1 ? "answer" : "answers"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article
          aria-label="Lesson"
          className="rounded-2xl border border-border bg-surface p-5 sm:p-8"
        >
          {reading.content ? (
            <>
              <ReadingContent
                markdown={reading.content.markdown}
                keyTakeaways={reading.content.keyTakeaways}
              />
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted">
                <span>Written {formatRelativeDate(reading.content.createdAt)}</span>
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
                Claude will write a short, interview-focused lesson on this concept: how it works,
                pitfalls and how interviewers probe it.
              </p>
              <GenerateReadingButton topicId={reading.topicId} conceptId={reading.conceptId} />
            </div>
          )}
        </article>

        <Card aria-labelledby="drill-heading" className="lg:sticky lg:top-6">
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
  );
}
