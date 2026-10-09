"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { generateReadingAction } from "@/server/actions/reading-actions";

interface GenerateReadingButtonProps {
  topicId: string;
  conceptId: string;
  /** When true, the button offers to rewrite the existing lesson. */
  hasReading?: boolean;
}

export function GenerateReadingButton({
  topicId,
  conceptId,
  hasReading,
}: GenerateReadingButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateReadingAction(topicId, conceptId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <Button
        variant={hasReading ? "ghost" : "primary"}
        size={hasReading ? "sm" : "md"}
        onClick={handleClick}
        disabled={pending}
      >
        {pending && <Spinner />}
        {pending ? "Writing lesson…" : hasReading ? "Rewrite lesson" : "Write the lesson"}
      </Button>
      <p className="text-sm text-muted" aria-live="polite">
        {pending ? "Detailed lessons with examples usually take about a minute." : ""}
      </p>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
