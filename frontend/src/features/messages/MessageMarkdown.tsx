import { isValidElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CopyButton } from "./CopyButton";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

export function MessageMarkdown({ text }: { readonly text: string }) {
  return (
    <div className="message-markdown w-full min-w-0">
      <Markdown remarkPlugins={[remarkGfm]} components={{
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
        pre: ({ children }) => (
          <div className="message-code-block">
            <div className="message-code-toolbar"><CopyButton text={textContent(children).replace(/\n$/, "")} /></div>
            <pre>{children}</pre>
          </div>
        ),
        table: ({ children }) => <div className="message-table-scroll"><table>{children}</table></div>,
      }}>{text}</Markdown>
    </div>
  );
}
