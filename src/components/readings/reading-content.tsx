import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReadingContentProps {
  markdown: string;
  keyTakeaways: readonly string[];
}

/**
 * Renders AI-written Markdown safely: raw HTML is skipped (react-markdown
 * never renders it), images are dropped so content can't load remote
 * resources, and links open in a new tab without leaking the referrer.
 */
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export function ReadingContent({ markdown, keyTakeaways }: ReadingContentProps) {
  return (
    <div className="space-y-8">
      {keyTakeaways.length > 0 && (
        <aside
          aria-labelledby="takeaways-heading"
          className="rounded-xl border border-accent/30 bg-accent-soft p-5"
        >
          <h2 id="takeaways-heading" className="mb-2 text-sm font-semibold">
            Key takeaways
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {keyTakeaways.map((takeaway, index) => (
              <li key={index}>{takeaway}</li>
            ))}
          </ul>
        </aside>
      )}
      <div className="prose max-w-none prose-neutral dark:prose-invert prose-headings:font-semibold prose-code:rounded prose-code:bg-surface-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:bg-code-bg prose-pre:text-code-ink [&_pre_code]:bg-transparent [&_pre_code]:p-0">
        <Markdown
          remarkPlugins={[remarkGfm]}
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
