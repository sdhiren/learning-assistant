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
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MasteryBadge } from "@/components/ui/mastery-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
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
      <header className="space-y-4">
        <Link href="/" className="text-sm text-muted hover:text-ink hover:underline">
          ← All topics
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{topic.name}</h1>
          <p className="max-w-3xl text-muted">{topic.summary}</p>
          {topic.goal && (
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">Goal:</span> {topic.goal}
            </p>
          )}
        </div>
        <div className="flex max-w-md items-center gap-3">
          <ProgressBar value={topic.progress} label="Topic mastery" />
          <span className="text-sm font-medium whitespace-nowrap">
            {formatPercent(topic.progress)} mastered
          </span>
        </div>
      </header>

      {topic.inProgressQuizId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4">
          <p className="font-medium">You have a quiz in progress.</p>
          <Link href={`/quizzes/${topic.inProgressQuizId}`} className={buttonClasses("primary")}>
            Continue quiz
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
