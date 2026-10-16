import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

interface ProgressRingProps {
  /** 0 to 1. */
  value: number;
  label: string;
  /** Diameter in pixels. */
  size?: number;
  strokeWidth?: number;
  /** Shown in the middle; defaults to the percentage. */
  children?: ReactNode;
  className?: string;
}

/** A circular progress indicator filled with the brand gradient. */
export function ProgressRing({
  value,
  label,
  size = 56,
  strokeWidth = 6,
  children,
  className,
}: ProgressRingProps) {
  const gradientId = useId();
  const clamped = Math.min(1, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={formatPercent(clamped)}
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5b3df5" />
            <stop offset="55%" stopColor="#9330d9" />
            <stop offset="100%" stopColor="#c8327a" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums"
      >
        {children ?? formatPercent(clamped)}
      </span>
    </div>
  );
}
