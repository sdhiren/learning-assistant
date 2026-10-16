import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";

const PIECE_COUNT = 28;
const COLOURS = ["#5b3df5", "#9330d9", "#c8327a", "#fbbf24", "#4ade80", "#38bdf8"];

/**
 * A one-off burst of confetti from the centre of its container. Positions
 * are derived from the index (not Math.random) and rounded to whole pixels,
 * since Node and the browser can disagree on the last digit of Math.cos, so
 * server and client markup match. Reduced-motion users get no movement (see globals.css).
 */
export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: PIECE_COUNT }, (_, index) => {
        const angle = (index / PIECE_COUNT) * Math.PI * 2;
        const distance = 110 + ((index * 37) % 90);
        const style = {
          "--confetti-x": `${Math.round(Math.cos(angle) * distance)}px`,
          "--confetti-y": `${Math.round(Math.sin(angle) * distance - 40)}px`,
          "--confetti-spin": `${(index % 2 ? 1 : -1) * (180 + index * 23)}deg`,
          backgroundColor: COLOURS[index % COLOURS.length],
          animationDelay: `${(index % 5) * 40}ms`,
        } as CSSProperties;
        return (
          <span
            key={index}
            style={style}
            className={cn(
              "absolute top-1/2 left-1/2 h-2.5 w-1.5 animate-confetti rounded-[2px] opacity-0",
              index % 3 === 0 && "rounded-full",
            )}
          />
        );
      })}
    </div>
  );
}
