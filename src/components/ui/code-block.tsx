import { cn } from "@/lib/cn";

interface CodeBlockProps {
  code: string;
  language?: string | null;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  return (
    <figure className={cn("overflow-hidden rounded-xl bg-code-bg text-code-ink", className)}>
      {language && (
        <figcaption className="border-b border-white/10 px-4 py-1.5 font-mono text-xs text-white/60">
          {language}
        </figcaption>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
