"use client";

import { useEffect, useState } from "react";

import { SparklesIcon } from "./icons";

/** Short, practical interview tips shown while Claude works. */
const TIPS = [
  "Interviewers care about how you reason, not only the final answer. Think out loud.",
  "When you're unsure, state your assumptions before answering.",
  "A small concrete example often explains a concept better than a definition.",
  "Practising a little every day beats one long session a week.",
  "Mention trade-offs: there is rarely one right answer in system design.",
  "Got one wrong? Read the lesson for that concept, then drill it again.",
  "Explain a concept in two sentences first, then go deeper if asked.",
];

const TIP_INTERVAL_MS = 7000;

interface GenerationProgressProps {
  /** What Claude is doing, e.g. "Claude is writing your quiz". */
  message: string;
  /** Typical duration, e.g. "20 to 60 seconds". */
  expected: string;
}

/**
 * Shown while a slow Claude request runs: an indeterminate bar, the time so
 * far, and rotating tips, so a minute-long wait doesn't feel stuck.
 */
export function GenerationProgress({ message, expected }: GenerationProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const startedAt = Date.now();
    const clock = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    const tips = setInterval(
      () => setTipIndex((index) => (index + 1) % TIPS.length),
      TIP_INTERVAL_MS,
    );
    return () => {
      clearInterval(clock);
      clearInterval(tips);
    };
  }, []);

  return (
    <div className="animate-fade-up space-y-3 rounded-xl border border-accent/30 bg-accent-soft p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p role="status" className="flex items-center gap-2 font-medium text-accent">
          <SparklesIcon className="animate-pulse" />
          {message}…
        </p>
        <span className="text-xs text-muted tabular-nums" aria-hidden="true">
          {elapsedSeconds}s · usually {expected}
        </span>
      </div>
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-accent/15">
        <div className="h-full w-2/5 animate-shimmer rounded-full bg-brand" />
      </div>
      <p key={tipIndex} className="animate-fade-up text-sm text-muted">
        <span className="font-medium text-ink">Tip:</span> {TIPS[tipIndex]}
      </p>
    </div>
  );
}
