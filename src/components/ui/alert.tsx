import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type AlertTone = "error" | "info";

const TONE_CLASSES: Record<AlertTone, string> = {
  error: "border-danger/30 bg-danger-soft text-danger",
  info: "border-border bg-surface-muted text-muted",
};

/** Inline message. Errors are announced to screen readers immediately. */
export function Alert({
  tone = "error",
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg border px-4 py-3 text-sm", TONE_CLASSES[tone], className)}
    >
      {children}
    </div>
  );
}
