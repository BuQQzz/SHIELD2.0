/**
 * An agent's words in the Team panel, rendered as the chat renders a reply
 * but sized for a narrow column. Shown as plain text, its lists and code
 * came through as literal "- " and backticks (2026-11-16).
 */

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";
import { displayText } from "./workView";

const COMPONENTS: Components = {
  p: ({ node: _node, ...props }) => (
    <p className="mb-1.5 last:mb-0" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="mb-1.5 list-disc space-y-0.5 pl-4" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="mb-1.5 list-decimal space-y-0.5 pl-4" {...props} />
  ),
  h1: ({ node: _node, ...props }) => (
    <p className="mb-1 font-semibold" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <p className="mb-1 font-semibold" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <p className="mb-1 font-semibold" {...props} />
  ),
  code: ({ node: _node, children, ...props }) => (
    <code
      className="rounded bg-muted px-1 py-px font-mono text-[11.5px]"
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="mb-1.5 max-h-40 overflow-auto rounded bg-muted/60 p-2 font-mono text-[11.5px] [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  a: ({ node: _node, ...props }) => (
    <a className="underline underline-offset-2" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="mb-1.5 overflow-x-auto">
      <table className="text-[12px]" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="pr-2 text-left font-medium" {...props} />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="pr-2 align-top" {...props} />
  ),
};

export const CompactMarkdown = memo(function CompactMarkdown({
  text,
}: {
  text: string;
}) {
  return (
    <div className="min-w-0 text-[13px] leading-snug [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {displayText(text)}
      </ReactMarkdown>
    </div>
  );
});
