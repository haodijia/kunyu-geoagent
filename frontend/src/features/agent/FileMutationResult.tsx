import { useMemo } from "react";

import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { diffRows, parseFileMutationResult } from "./file-diffs";

const content = zhCN.conversation.tools.files;

export function FileMutationResult({ value, text }: { readonly value: unknown; readonly text: string }) {
  const result = useMemo(() => parseFileMutationResult(value), [value]);
  const hunks = useMemo(() => result.diffs.map(diffRows), [result]);
  const rows = hunks.flat();
  const additions = rows.filter((row) => row.kind === "addition").length;
  const deletions = rows.filter((row) => row.kind === "deletion").length;
  const name = result.path.split("/").at(-1)!;
  return <div className="mb-2 min-w-0 overflow-hidden rounded-lg border border-border" data-file-diff-path={result.path}>
    <div className="flex min-w-0 items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-2" title={result.path}>
        <span className="size-2 shrink-0 rounded-full bg-[var(--mu-diff-add)]" />
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="shrink-0 text-[11px] text-secondary-foreground">{result.operation === "create" ? content.created : content.updated}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {(additions > 0 || deletions > 0) && <span className="flex gap-1 px-1 py-0.5" aria-label={content.changes(result.path)}>
          {additions > 0 && <span className="text-sm font-medium text-[var(--mu-diff-add)]" aria-label={content.additions(additions)}>+{additions}</span>}
          {deletions > 0 && <span className="text-sm font-medium text-[var(--mu-diff-del)]" aria-label={content.deletions(deletions)}>−{deletions}</span>}
        </span>}
        <CopyButton text={text} />
      </div>
    </div>
    {hunks.length === 0 && <p className="m-0 px-4 pb-3 text-xs text-secondary-foreground">{content.unchanged}</p>}
  </div>;
}
