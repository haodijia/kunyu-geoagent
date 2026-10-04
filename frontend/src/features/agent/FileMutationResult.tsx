import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { diffRows, parseFileMutationResult } from "./file-diffs";

const content = zhCN.conversation.tools.files;

export function FileMutationResult({ value, text }: { readonly value: unknown; readonly text: string }) {
  const [expanded, setExpanded] = useState(false);
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
        {additions > 0 && <span className="text-sm font-medium text-[var(--mu-diff-add)]" aria-label={content.additions(additions)}>+{additions}</span>}
        {deletions > 0 && <span className="text-sm font-medium text-[var(--mu-diff-del)]" aria-label={content.deletions(deletions)}>−{deletions}</span>}
        {hunks.length > 0 && <Button type="button" variant="ghost" size="sm" className="gap-1 px-1 text-xs text-secondary-foreground" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          <Eye className="size-3.5" />{content.preview}{expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </Button>}
        <CopyButton text={text} />
      </div>
    </div>
    {hunks.length === 0 && <p className="m-0 px-4 pb-3 text-xs text-secondary-foreground">{content.unchanged}</p>}
    {expanded && <div className="max-h-80 overflow-auto border-t border-border" role="region" aria-label={content.changes(result.path)} tabIndex={0}>
      {hunks.map((hunk, index) => <div key={index} className="border-b border-border last:border-0" data-file-diff-hunk={index}>
        <div className="bg-muted px-3 py-1 text-[11px] text-secondary-foreground">{content.hunk(index + 1)}</div>
        {hunk.map((row, line) => <div key={line} data-diff-kind={row.kind} className={`flex font-mono text-xs leading-relaxed ${row.kind === "addition" ? "bg-[var(--mu-diff-add-bg)]" : row.kind === "deletion" ? "bg-[var(--mu-diff-del-bg)]" : "bg-background"}`}>
          <span className="w-6 shrink-0 text-center text-muted-foreground select-none" aria-hidden="true">{row.kind === "addition" ? "+" : row.kind === "deletion" ? "−" : " "}</span>
          <span className="min-w-0 flex-1 pr-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{row.text || "\u00a0"}</span>
        </div>)}
      </div>)}
    </div>}
  </div>;
}
