import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ComponentPropsWithoutRef } from "react";
import { CodeBlock } from "./CodeBlock";

interface MessageContentProps {
  content: string;
}

interface CodeProps extends ComponentPropsWithoutRef<"code"> {
  inline?: boolean;
  className?: string;
}

export function MessageContent({ content }: MessageContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ inline, className, children, ...props }: CodeProps) {
          const match = /language-(\w+)/.exec(className || "");
          const codeContent = String(children).replace(/\n$/, "");

          return !inline && match ? (
            <CodeBlock language={match[1] || "text"} code={codeContent} />
          ) : (
            <code
              className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        h1({ children, ...props }: ComponentPropsWithoutRef<"h1">) {
          return (
            <h1
              className="text-3xl font-bold mt-6 mb-3 text-foreground"
              {...props}
            >
              {children}
            </h1>
          );
        },
        h2({ children, ...props }: ComponentPropsWithoutRef<"h2">) {
          return (
            <h2
              className="text-2xl font-bold mt-5 mb-3 text-foreground"
              {...props}
            >
              {children}
            </h2>
          );
        },
        h3({ children, ...props }: ComponentPropsWithoutRef<"h3">) {
          return (
            <h3
              className="text-xl font-bold mt-4 mb-2 text-foreground"
              {...props}
            >
              {children}
            </h3>
          );
        },
        h4({ children, ...props }: ComponentPropsWithoutRef<"h4">) {
          return (
            <h4
              className="text-lg font-semibold mt-3 mb-2 text-foreground"
              {...props}
            >
              {children}
            </h4>
          );
        },
        h5({ children, ...props }: ComponentPropsWithoutRef<"h5">) {
          return (
            <h5
              className="text-base font-semibold mt-2 mb-1 text-foreground"
              {...props}
            >
              {children}
            </h5>
          );
        },
        h6({ children, ...props }: ComponentPropsWithoutRef<"h6">) {
          return (
            <h6
              className="text-sm font-semibold mt-2 mb-1 text-foreground"
              {...props}
            >
              {children}
            </h6>
          );
        },
        strong({ children, ...props }: ComponentPropsWithoutRef<"strong">) {
          return (
            <strong className="font-bold text-foreground" {...props}>
              {children}
            </strong>
          );
        },
        em({ children, ...props }: ComponentPropsWithoutRef<"em">) {
          return (
            <em className="italic" {...props}>
              {children}
            </em>
          );
        },
        p({ children, ...props }: ComponentPropsWithoutRef<"p">) {
          return (
            <p className="mb-2 leading-relaxed" {...props}>
              {children}
            </p>
          );
        },
        ul({ children, ...props }: ComponentPropsWithoutRef<"ul">) {
          return (
            <ul className="list-disc list-inside mb-2 space-y-1" {...props}>
              {children}
            </ul>
          );
        },
        ol({ children, ...props }: ComponentPropsWithoutRef<"ol">) {
          return (
            <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>
              {children}
            </ol>
          );
        },
        li({ children, ...props }: ComponentPropsWithoutRef<"li">) {
          return (
            <li className="ml-4" {...props}>
              {children}
            </li>
          );
        },
        blockquote({
          children,
          ...props
        }: ComponentPropsWithoutRef<"blockquote">) {
          return (
            <blockquote
              className="border-l-4 border-primary pl-4 italic my-2 text-muted-foreground"
              {...props}
            >
              {children}
            </blockquote>
          );
        },
        a({ children, ...props }: ComponentPropsWithoutRef<"a">) {
          return (
            <a
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          );
        },
        table({ children, ...props }: ComponentPropsWithoutRef<"table">) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse" {...props}>
                {children}
              </table>
            </div>
          );
        },
        th({ children, ...props }: ComponentPropsWithoutRef<"th">) {
          return (
            <th
              className="border border-border bg-muted px-3 py-2 text-left font-semibold"
              {...props}
            >
              {children}
            </th>
          );
        },
        td({ children, ...props }: ComponentPropsWithoutRef<"td">) {
          return (
            <td className="border border-border px-3 py-2" {...props}>
              {children}
            </td>
          );
        },
        hr({ ...props }: ComponentPropsWithoutRef<"hr">) {
          return <hr className="my-4 border-border" {...props} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
