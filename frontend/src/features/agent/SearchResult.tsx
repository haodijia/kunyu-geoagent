import { FileImage, FileText } from "lucide-react";

import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { parseSearchResult } from "./search-result";
import { ToolResultPanel } from "./ToolActivityParts";
import styles from "./ToolActivity.module.css";

const content = zhCN.conversation.tools;

export function SearchResult({ value, text }: { readonly value: unknown; readonly text: string }) {
  const result = parseSearchResult(value);
  const kept = result.shape === "paths" ? result.paths.length : result.files.reduce((total, file) => total + file.matches.length, 0);
  return <div className="min-w-0" data-search-shape={result.shape}>
    <ToolResultPanel label={content.search.count(result.shape, kept, result.total)} copyText={text}>
    {kept === 0 ? <p className={styles.resultEmpty}>{content.search.empty(result.shape)}</p>
      : <div className={styles.resultList} role="region" aria-label={content.search.results} tabIndex={0}>
        {result.shape === "paths" ? <ul className="m-0 list-none p-0">
          {result.paths.map((path, index) => <li key={index} className={styles.resultPath} data-search-path={path}>
            <PathIcon path={path} />
            <span>{path}</span>
          </li>)}
        </ul> : result.files.map(file => <div key={file.path} className="border-b border-border last:border-b-0" data-search-path={file.path}>
          <div className={`${styles.resultPath} border-b border-border bg-muted/50`}>
            <PathIcon path={file.path} />
            <span>{file.path}</span>
          </div>
          <table className="w-full border-collapse font-mono text-xs leading-relaxed"><tbody>{file.matches.map((match, index) => <tr key={index} data-search-line={match.lineNumber}>
            <td className="w-px px-2.5 py-1 text-right align-top text-muted-foreground"><span className="min-w-0 truncate [overflow-wrap:anywhere]">{match.lineNumber}</span></td>
            <td className="py-1 pr-2.5 align-top whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]">{match.line || "\u00a0"}</td>
          </tr>)}</tbody></table>
        </div>)}
      </div>}
    </ToolResultPanel>
    {result.truncated && <p className="mt-1 mb-0 text-[11px] text-secondary-foreground">{content.search.capped}</p>}
    {result.artifact_path !== null && <div className="mt-1 flex min-w-0 items-start gap-2 text-[11px] text-secondary-foreground">
      <span className="min-w-0 truncate [overflow-wrap:anywhere]">{content.search.artifact(result.artifact_path)}</span>
      <CopyButton text={result.artifact_path} />
    </div>}
  </div>;
}

function PathIcon({ path }: { readonly path: string }) {
  const Icon = /\.(?:png|jpe?g|webp|gif)$/i.test(path) ? FileImage : FileText;
  return <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}
