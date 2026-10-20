"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

interface ConfirmDeleteButtonProps {
  /** Button label, e.g. "Delete topic". */
  label: string;
  /** The confirmation question, e.g. "Delete “Kafka” for good?". */
  confirmation: string;
  /** A server action (with its arguments bound) that performs the delete. */
  action: () => Promise<ActionResult>;
}

/** Two-step delete: the first click asks for confirmation. */
export function ConfirmDeleteButton({ label, confirmation, action }: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm deletion">
      <span className="text-sm">{confirmation}</span>
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
