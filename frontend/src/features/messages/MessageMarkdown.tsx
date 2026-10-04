import { isValidElement, type ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CopyButton } from "./CopyButton";
import { isLocalFileHref } from "@/features/files/file-path";
import { FileLink } from "@/features/files/FileLink";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

export function MessageMarkdown({ text, basePath = "/workspace/" }: { readonly text: string; readonly basePath?: string }) {
  return (
    <div className="message-markdown w-full min-w-0">
      <Markdown remarkPlugins={[remarkGfm]} urlTransform={(url, key) => key === "href" && isLocalFileHref(url) ? url : defaultUrlTransform(url)} components={{
        a: ({ children, href }) => href !== undefined && href !== "" && isLocalFileHref(href) ? <FileLink href={href} base={basePath}>{children}</FileLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
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
