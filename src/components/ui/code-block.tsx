import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

import { normalizeCode } from "@/domain/code-format";
import { cn } from "@/lib/cn";
import { highlightCode, languageLabel } from "@/lib/highlight";

interface CodeBlockProps {
  code: string;
  language?: string | null;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  // Questions stored before generation-time normalisation are tidied here too.
  const cleanCode = normalizeCode(code);
  const tree = highlightCode(cleanCode, language);
  const showLabel = language && language !== "text";

  return (
    <figure className={cn("overflow-hidden rounded-xl bg-code-bg text-code-ink", className)}>
      {showLabel && (
        <figcaption className="border-b border-white/10 px-4 py-1.5 font-mono text-xs text-white/60">
          {languageLabel(language)}
        </figcaption>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed [tab-size:4]">
        <code className="hljs">
          {tree ? toJsxRuntime(tree, { Fragment, jsx, jsxs }) : cleanCode}
        </code>
      </pre>
    </figure>
  );
}
