"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { useAiProvider } from "@/components/ai-provider-context";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GenerationProgress } from "@/components/ui/generation-progress";
import {
  createTopicFromSuggestionAction,
  dismissSuggestionAction,
  personaliseSuggestionsAction,
} from "@/server/actions/suggestion-actions";
import type { TopicSuggestionView, TopicSuggestionsView } from "@/server/services/view-models";

type Busy = { kind: "start"; name: string } | { kind: "personalise" } | { kind: "dismiss" } | null;

/** "Suggested for you": topics from the profile's interests, with one-click start. */
export function SuggestedTopics({
  view,
  hasInterests,
}: {
  view: TopicSuggestionsView;
  hasInterests: boolean;
}) {
  const { label } = useAiProvider();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(next: NonNullable<Busy>, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(next);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? null);
      setBusy(null);
    });
  }

  const start = (suggestion: TopicSuggestionView) =>
    run({ kind: "start", name: suggestion.name }, () =>
      createTopicFromSuggestionAction({ name: suggestion.name, goal: suggestion.goal }),
    );

  if (!hasInterests) {
    return (
      <p className="text-sm text-muted">
        Add your interests on your{" "}
        <Link href="/profile" className="font-medium text-accent hover:underline">
          profile
        </Link>{" "}
        to get topic suggestions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {view.source === "ai"
            ? `Picked by ${label} from your interests, role and level.`
            : "Based on your interests."}
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run({ kind: "personalise" }, personaliseSuggestionsAction)}
        >
          {view.source === "ai" ? "Suggest again" : `Personalise with ${label}`}
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}
      {busy?.kind === "personalise" && (
        <GenerationProgress
          message={`${label} is picking topics for you`}
          expected="5 to 20 seconds"
        />
      )}
      {busy?.kind === "start" && (
        <GenerationProgress
          message={`${label} is designing your skill map for ${busy.name}`}
          expected="15 to 40 seconds"
        />
      )}

      {view.suggestions.length === 0 ? (
        <p className="text-sm text-muted">
          No new suggestions right now. Try{" "}
          {view.source === "ai" ? "suggesting again" : "personalising"}.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {view.suggestions.map((suggestion) => (
            <li
              key={suggestion.name}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
            >
              <div className="space-y-1">
                <h3 className="font-medium">{suggestion.name}</h3>
                <p className="text-sm text-muted">{suggestion.reason}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending} onClick={() => start(suggestion)}>
                  Start this topic
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`Dismiss ${suggestion.name}`}
                  onClick={() =>
                    run({ kind: "dismiss" }, () => dismissSuggestionAction(suggestion.name))
                  }
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
