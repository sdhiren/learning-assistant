import type { Metadata } from "next";
import { connection } from "next/server";
import { cache } from "react";

import { ConceptList } from "@/components/topics/concept-list";
import { StartQuizForm } from "@/components/topics/start-quiz-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatPercent } from "@/lib/format";
import { getServices } from "@/server/container";
import { orNotFound } from "@/server/or-not-found";

type SubtopicPageProps = PageProps<"/topics/[topicId]/subtopics/[subtopicId]">;

/** Loads the subtopic once per request; shared by the metadata and the page. */
const loadSubtopic = cache(async (topicId: string, subtopicId: string) => {
  await connection();
  return orNotFound(() => getServices().subtopics.getSubtopic(topicId, subtopicId));
});

export async function generateMetadata(props: SubtopicPageProps): Promise<Metadata> {
  const { topicId, subtopicId } = await props.params;
  const subtopic = await loadSubtopic(topicId, subtopicId);
  return { title: `${subtopic.name} · ${subtopic.topicName}` };
}

export default async function SubtopicPage(props: SubtopicPageProps) {
  const { topicId, subtopicId } = await props.params;
  const subtopic = await loadSubtopic(topicId, subtopicId);

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs
          items={[
            { label: "Topics", href: "/" },
            { label: subtopic.topicName, href: `/topics/${subtopic.topicId}` },
            { label: subtopic.name },
          ]}
        />
        <p className="text-sm font-medium text-accent">
          {subtopic.origin === "learner" ? "Subtopic · added by you" : "Subtopic"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{subtopic.name}</h1>
        <div className="mt-4 flex max-w-md items-center gap-3">
          <ProgressBar value={subtopic.progress} label="Subtopic mastery" />
          <span className="text-sm font-medium whitespace-nowrap">
            {formatPercent(subtopic.progress)} mastered
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-labelledby="concepts-heading"
          className="overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <h2 id="concepts-heading" className="border-b border-border px-5 py-3 font-medium">
            {subtopic.concepts.length} concepts
          </h2>
          <ConceptList topicId={subtopic.topicId} concepts={subtopic.concepts} />
        </section>

        <Card aria-labelledby="subtopic-quiz-heading" className="lg:sticky lg:top-6">
          <CardTitle id="subtopic-quiz-heading">Quiz this subtopic</CardTitle>
          <p className="mt-1 mb-5 text-sm text-muted">
            Questions cover the concepts on this page, weakest first.
          </p>
          <StartQuizForm
            topicId={subtopic.topicId}
            fixedFocus={{ kind: "subtopic", id: subtopic.id }}
          />
        </Card>
      </div>
    </div>
  );
}
