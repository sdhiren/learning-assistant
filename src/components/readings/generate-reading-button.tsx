"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GenerationProgress } from "@/components/ui/generation-progress";
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
      {pending && (
        <GenerationProgress message="Claude is writing your lesson" expected="about a minute" />
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
