import { FileText } from "lucide-react";

import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { parseSearchResult } from "./search-result";
import { useFilePreview } from "@/features/files/FilePreviewContext";

const content = zhCN.conversation.tools;

export function SearchResult({ value, text }: { readonly value: unknown; readonly text: string }) {
  const result = parseSearchResult(value);
  const preview = useFilePreview();
  const kept = result.shape === "paths" ? result.paths.length : result.files.reduce((total, file) => total + file.matches.length, 0);
  return <div className="mb-2 min-w-0" data-search-shape={result.shape}>
    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-secondary-foreground">
      <span>{content.output} · {content.search.count(result.shape, kept, result.total)}</span>
      <CopyButton text={text} />
    </div>
    {kept === 0 ? <p className="m-0 rounded-md bg-muted px-2.5 py-2 text-xs text-secondary-foreground">{content.search.empty(result.shape)}</p>
      : <div className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/50" role="region" aria-label={content.search.results} tabIndex={0}>
        {result.shape === "paths" ? <ul className="m-0 list-none p-0">
          {result.paths.map((path, index) => <li key={index} className="flex min-w-0 items-start gap-2 border-b border-border px-2.5 py-1.5 last:border-b-0" data-search-path={path}>
            <FileText className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <button type="button" className="min-w-0 text-left font-mono text-xs text-secondary-foreground hover:text-primary [overflow-wrap:anywhere]" onClick={() => preview.openFile(path)}>{path}</button>
          </li>)}
        </ul> : result.files.map(file => <div key={file.path} className="border-b border-border last:border-b-0" data-search-path={file.path}>
          <div className="flex items-start gap-2 border-b border-border bg-muted px-2.5 py-1.5">
            <FileText className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <button type="button" className="min-w-0 text-left font-mono text-xs text-foreground hover:text-primary [overflow-wrap:anywhere]" onClick={() => preview.openFile(file.path)}>{file.path}</button>
          </div>
          <table className="w-full border-collapse font-mono text-xs leading-relaxed"><tbody>{file.matches.map((match, index) => <tr key={index} data-search-line={match.lineNumber}>
            <td className="w-px px-2.5 py-1 text-right align-top text-muted-foreground"><button type="button" className="hover:text-primary" aria-label={zhCN.filePreview.line(file.path, match.lineNumber)} onClick={() => preview.openFile(file.path, match.lineNumber)}>{match.lineNumber}</button></td>
            <td className="py-1 pr-2.5 align-top whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]">{match.line || "\u00a0"}</td>
          </tr>)}</tbody></table>
        </div>)}
      </div>}
    {result.truncated && <p className="mt-1 mb-0 text-[11px] text-secondary-foreground">{content.search.capped}</p>}
    {result.artifact_path !== null && <div className="mt-1 flex min-w-0 items-start gap-2 text-[11px] text-secondary-foreground">
      <button type="button" className="min-w-0 flex-1 text-left hover:text-primary [overflow-wrap:anywhere]" onClick={() => preview.openFile(result.artifact_path!)}>{content.search.artifact(result.artifact_path)}</button>
      <CopyButton text={result.artifact_path} />
    </div>}
  </div>;
}
