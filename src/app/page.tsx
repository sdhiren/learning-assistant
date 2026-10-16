import { connection } from "next/server";

import { NextUp } from "@/components/dashboard/next-up";
import { PracticeStats } from "@/components/dashboard/practice-stats";
import { CreateTopicForm } from "@/components/topics/create-topic-form";
import { TopicCard } from "@/components/topics/topic-card";
import { getServices } from "@/server/container";

export default async function HomePage() {
  await connection();
  const services = getServices();
  const topics = services.topics.listTopics();
  const dashboard = services.dashboard.getDashboard();
  const hasTopics = topics.length > 0;

  return (
    <div className="space-y-10">
      <section className="animate-fade-up space-y-5">
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-accent" />
            Interview prep, powered by Claude
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {hasTopics ? (
              <>
                Keep your skills <span className="text-brand">sharp</span>.
              </>
            ) : (
              <>
                What are you <span className="text-brand">preparing for</span>?
              </>
            )}
          </h1>
          <p className="max-w-2xl text-lg text-muted">
            Pick any technical topic. Claude builds a skill map for it, quizzes you at the level you
            choose, and keeps track of what you still need to practise.
          </p>
        </div>
        {hasTopics && <PracticeStats dashboard={dashboard} />}
      </section>

      {hasTopics && (
        <div className="animate-fade-up [animation-delay:80ms]">
          <NextUp dashboard={dashboard} />
        </div>
      )}

      {hasTopics && (
        <section
          aria-labelledby="topics-heading"
          className="animate-fade-up space-y-4 [animation-delay:160ms]"
        >
          <h2 id="topics-heading" className="text-lg font-semibold">
            Your topics
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic.id}>
                <TopicCard topic={topic} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="new-topic-heading"
        className="animate-fade-up space-y-4 [animation-delay:240ms]"
      >
        <div>
          <h2 id="new-topic-heading" className="text-lg font-semibold">
            {hasTopics ? "Start a new topic" : "Create your first topic"}
          </h2>
          {!hasTopics && (
            <p className="text-sm text-muted">
              Name what you want to practise. You can add your own subtopics later.
            </p>
          )}
        </div>
        <CreateTopicForm />
      </section>
    </div>
  );
}
