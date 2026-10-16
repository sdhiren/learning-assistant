import type { ElementContent } from "hast";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { CheckCircleIcon } from "@/components/ui/icons";
import { slugify } from "@/lib/lesson-outline";

interface ReadingContentProps {
  markdown: string;
  keyTakeaways: readonly string[];
}

/** Plain text of a Markdown syntax-tree node. */
function textOf(node: ElementContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

/**
 * Renders AI-written Markdown safely: raw HTML is skipped (react-markdown
 * never renders it), images are dropped so content can't load remote
 * resources, and links open in a new tab without leaking the referrer.
 * Fenced code is syntax-highlighted with the same grammars and colours as
 * quiz code blocks (see lib/highlight.ts).
 *
 * `##` headings get ids matching `extractOutline`, for the lesson contents,
 * and "Answer: ..." paragraphs (from "Check your understanding") stay hidden
 * until the reader asks, so they can test themselves first.
 */
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  h2: ({ node, children }) => (
    <h2 id={slugify(textOf(node))} className="scroll-mt-24">
      {children}
    </h2>
  ),
  p: ({ node, children }) => {
    if (!/^\s*answer\s*:/i.test(textOf(node))) return <p>{children}</p>;
    return (
      <details className="group not-prose my-3 rounded-xl border border-border bg-surface-muted text-sm open:border-success/40 open:bg-success-soft">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-medium text-accent select-none group-open:text-success [&::-webkit-details-marker]:hidden">
          <CheckCircleIcon className="size-4" />
          <span className="group-open:hidden">Show answer</span>
          <span className="hidden group-open:inline">Answer</span>
        </summary>
        <p className="animate-fade-up px-4 pb-3 leading-relaxed text-ink">{children}</p>
      </details>
    );
  },
};

export function ReadingContent({ markdown, keyTakeaways }: ReadingContentProps) {
  return (
    <div className="space-y-8">
      {keyTakeaways.length > 0 && (
        <aside
          aria-labelledby="takeaways-heading"
          className="relative overflow-hidden rounded-xl border border-accent/30 bg-accent-soft p-5"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand" />
          <h2 id="takeaways-heading" className="mb-3 text-sm font-semibold text-accent">
            Key takeaways
          </h2>
          <ul className="space-y-2 text-sm">
            {keyTakeaways.map((takeaway, index) => (
              <li key={index} className="flex gap-2.5">
                <CheckCircleIcon className="mt-0.5 size-4 text-accent" />
                <span>{takeaway}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="prose max-w-none prose-neutral dark:prose-invert prose-headings:font-semibold prose-code:rounded prose-code:bg-surface-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:bg-code-bg prose-pre:[tab-size:4] prose-pre:text-code-ink [&_pre_code]:bg-transparent [&_pre_code]:p-0">
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          skipHtml
          disallowedElements={["img"]}
          components={markdownComponents}
        >
          {markdown}
        </Markdown>
      </div>
    </div>
  );
}
