"use client";

import { useEffect, useRef } from "react";

/**
 * A thin bar under the header that fills as the reader scrolls through the
 * lesson. It updates the DOM directly, so scrolling never re-renders React.
 */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const bar = barRef.current;
    if (!target || !bar) return;

    let frame = 0;
    function update() {
      frame = 0;
      const rect = target!.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress = scrollable <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / scrollable));
      bar!.style.transform = `scaleX(${progress})`;
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return (
    <div aria-hidden="true" className="fixed inset-x-0 top-14 z-30 h-0.5">
      <div ref={barRef} className="h-full origin-left scale-x-0 bg-brand" />
    </div>
  );
}
