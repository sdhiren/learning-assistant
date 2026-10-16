import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cache } from "react";

import { AddSubtopicForm } from "@/components/topics/add-subtopic-form";
import { DeleteTopicButton } from "@/components/topics/delete-topic-button";
import { RecentQuizzes } from "@/components/topics/recent-quizzes";
import { SkillTree } from "@/components/topics/skill-tree";
import { StartQuizForm } from "@/components/topics/start-quiz-form";
import { TopicStats } from "@/components/topics/topic-stats";
import { ArrowRightIcon, PlayIcon, TargetIcon } from "@/components/ui/icons";
import { Card, CardTitle } from "@/components/ui/card";
import { MasteryBadge } from "@/components/ui/mastery-badge";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatPercent } from "@/lib/format";
import { getServices } from "@/server/container";
import { orNotFound } from "@/server/or-not-found";

/** Loads the overview once per request; shared by the metadata and the page. */
const loadTopic = cache(async (topicId: string) => {
  await connection();
  return orNotFound(() => getServices().topics.getTopicOverview(topicId));
});

export async function generateMetadata(props: PageProps<"/topics/[topicId]">): Promise<Metadata> {
  const { topicId } = await props.params;
  return { title: (await loadTopic(topicId)).name };
}

export default async function TopicPage(props: PageProps<"/topics/[topicId]">) {
  const { topicId } = await props.params;
  const topic = await loadTopic(topicId);

  return (
    <div className="space-y-8">
      <header className="animate-fade-up space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent"
        >
          <span aria-hidden="true">←</span> All topics
        </Link>
        <div className="flex flex-col-reverse gap-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {topic.name}
            </h1>
            <p className="max-w-3xl text-muted">{topic.summary}</p>
            {topic.goal && (
              <p className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-sm">
                <TargetIcon className="size-3.5 text-accent" />
                <span className="sr-only">Goal:</span>
                {topic.goal}
              </p>
            )}
          </div>
          <ProgressRing value={topic.progress} label="Topic mastery" size={96} strokeWidth={9}>
            <span className="flex flex-col items-center leading-tight">
              <span className="text-xl">{formatPercent(topic.progress)}</span>
              <span className="text-[10px] font-medium text-muted uppercase">mastered</span>
            </span>
          </ProgressRing>
        </div>
      </header>

      {topic.inProgressQuizId && (
        <div className="flex animate-pop flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand px-5 py-4 text-white shadow-lift">
          <p className="flex items-center gap-2 font-medium">
            <PlayIcon className="size-4" />
            You have a quiz in progress. Pick up where you left off.
          </p>
          <Link
            href={`/quizzes/${topic.inProgressQuizId}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-accent transition-transform hover:-translate-y-px"
          >
            Continue quiz
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card aria-labelledby="start-quiz-heading">
          <CardTitle id="start-quiz-heading">Start a quiz</CardTitle>
          <p className="mt-1 mb-5 text-sm text-muted">
            By default, questions target your weakest and not-yet-practised concepts.
          </p>
          <StartQuizForm topicId={topic.id} focusOptions={topic.subtopics} />
        </Card>

        <div className="space-y-6">
          <Card aria-labelledby="focus-heading">
            <CardTitle id="focus-heading">Focus areas</CardTitle>
            <ul className="mt-4 space-y-3">
              {topic.focusAreas.map((concept) => (
                <li key={concept.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/topics/${topic.id}/concepts/${concept.id}`}
                    className="text-sm font-medium hover:text-accent hover:underline"
                  >
                    {concept.name}
                  </Link>
                  <MasteryBadge level={concept.mastery.level} />
                </li>
              ))}
            </ul>
          </Card>
          <TopicStats stats={topic.stats} />
        </div>
      </div>

      <SkillTree topicId={topic.id} subtopics={topic.subtopics} />

      <Card aria-labelledby="add-subtopic-heading">
        <CardTitle id="add-subtopic-heading">Add a subtopic</CardTitle>
        <p className="mt-1 mb-5 text-sm text-muted">
          Missing something you want to practise? Name it and Claude will break it into concepts and
          add it to your skill map.
        </p>
        <AddSubtopicForm topicId={topic.id} />
      </Card>

      <RecentQuizzes quizzes={topic.recentQuizzes} />

      <section
        aria-labelledby="danger-heading"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-danger/30 p-5"
      >
        <div>
          <h2 id="danger-heading" className="font-semibold">
            Delete topic
          </h2>
          <p className="text-sm text-muted">
            Removes the topic with all of its quizzes and readings.
          </p>
        </div>
        <DeleteTopicButton topicId={topic.id} topicName={topic.name} />
      </section>
    </div>
  );
}
