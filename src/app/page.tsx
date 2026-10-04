import { connection } from "next/server";

import { CreateTopicForm } from "@/components/topics/create-topic-form";
import { TopicCard } from "@/components/topics/topic-card";
import { getServices } from "@/server/container";

export default async function HomePage() {
  await connection();
  const topics = getServices().topics.listTopics();

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            What are you preparing for?
          </h1>
          <p className="max-w-2xl text-muted">
            Pick any technical topic. Claude builds a skill map for it, quizzes you at the level you
            choose, and keeps track of what you still need to practise.
          </p>
        </div>
        <CreateTopicForm />
      </section>

      <section aria-labelledby="topics-heading" className="space-y-4">
        <h2 id="topics-heading" className="text-lg font-semibold">
          Your topics
        </h2>
        {topics.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-muted">
            No topics yet. Try something like “Kubernetes networking”, “React performance” or
            “System design: rate limiters”.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic.id}>
                <TopicCard topic={topic} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
