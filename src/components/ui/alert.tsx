import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { CheckCircleIcon } from "./icons";

type AlertTone = "error" | "info" | "success";

const TONE_CLASSES: Record<AlertTone, string> = {
  error: "border-danger/30 bg-danger-soft text-danger",
  info: "border-border bg-surface-muted text-muted",
  success: "border-success/30 bg-success-soft text-success",
};

/**
 * Inline message. Errors are announced to screen readers immediately; info
 * and success are announced politely.
 */
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
      className={cn(
        "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {tone === "success" && <CheckCircleIcon className="mt-0.5" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
