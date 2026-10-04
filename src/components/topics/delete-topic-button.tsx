"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteTopicAction } from "@/server/actions/topic-actions";

interface DeleteTopicButtonProps {
  topicId: string;
  topicName: string;
}

/** Two-step delete: the first click asks for confirmation. */
export function DeleteTopicButton({ topicId, topicName }: DeleteTopicButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTopicAction(topicId);
      if (!result.ok) setError(result.error);
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete topic
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm deletion">
      <span className="text-sm">Delete “{topicName}” for good?</span>
      <Button variant="danger" onClick={handleDelete} disabled={pending} autoFocus>
        {pending ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
