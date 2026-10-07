import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";

export function ImageReadResult({ value, text }: { readonly value: unknown; readonly text: string }) {
  if (typeof value !== "object" || value === null || !("path" in value) || typeof value.path !== "string" || !value.path) throw new Error("Invalid image read result.");
  const path = value.path;
  return <div className="mb-2 min-w-0" data-read-image-path={path}>
    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-secondary-foreground">
      <span className="min-w-0 truncate [overflow-wrap:anywhere]">{zhCN.conversation.tools.output} · {path}</span>
      <CopyButton text={text} />
    </div>
    <pre className="m-0 max-h-80 overflow-auto rounded-md bg-muted p-2.5 font-mono text-xs leading-relaxed text-secondary-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</pre>
  </div>;
}
