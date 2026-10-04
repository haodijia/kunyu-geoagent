import { useMemo } from "react";
import { diffRows, type FileMutationResult } from "@/features/agent/file-diffs";
import { zhCN } from "@/locales/zh-CN";

export function AppliedDiff({ result }: { readonly result: FileMutationResult }) {
  const hunks = useMemo(() => result.diffs.map(diffRows), [result]);
  return <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label={zhCN.conversation.tools.files.changes(result.path)} tabIndex={0}>
    {hunks.length === 0 && <p className="px-4 text-xs text-secondary-foreground">{zhCN.conversation.tools.files.unchanged}</p>}
    {hunks.map((hunk, index) => <div key={index} className="border-b border-border last:border-0" data-file-diff-hunk={index}>
      <div className="bg-muted px-3 py-1 text-[11px] text-secondary-foreground">{zhCN.conversation.tools.files.hunk(index + 1)}</div>
      {hunk.map((row, line) => <div key={line} data-diff-kind={row.kind} className={`flex font-mono text-xs leading-relaxed ${row.kind === "addition" ? "bg-[var(--mu-diff-add-bg)]" : row.kind === "deletion" ? "bg-[var(--mu-diff-del-bg)]" : "bg-background"}`}>
        <span className="w-6 shrink-0 text-center text-muted-foreground select-none" aria-hidden="true">{row.kind === "addition" ? "+" : row.kind === "deletion" ? "−" : " "}</span>
        <span className="min-w-0 flex-1 pr-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{row.text || "\u00a0"}</span>
      </div>)}
    </div>)}
  </div>;
}
