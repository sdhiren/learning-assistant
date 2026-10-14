import { splitInlineCode } from "@/domain/code-format";

/** Renders prose with `backtick` spans shown as inline code. */
export function InlineCodeText({ text }: { text: string }) {
  return splitInlineCode(text).map((segment, index) =>
    segment.kind === "code" ? (
      <code key={index} className="rounded bg-ink/8 px-1 py-0.5 font-mono text-[0.9em] font-normal">
        {segment.value}
      </code>
    ) : (
      segment.value
    ),
  );
}
