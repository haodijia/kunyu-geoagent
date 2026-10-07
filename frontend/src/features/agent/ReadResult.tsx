import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { parseReadResult } from "./read-result";

const content = zhCN.conversation.tools;

export function ReadResult({ value, text }: { readonly value: unknown; readonly text: string }) {
  const result = parseReadResult(value);
  const end = result.lines.at(-1)?.number ?? Math.max(0, result.offset - 1);
  return <div className="mb-2 min-w-0" data-read-path={result.path}>
    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-secondary-foreground">
      <span className="min-w-0 truncate [overflow-wrap:anywhere]">{content.output} · {result.path}{result.lang === undefined ? "" : ` · ${result.lang}`}</span>
      <CopyButton text={text} />
    </div>
    {result.lines.length > 0 && <div className="max-h-80 overflow-auto rounded-md bg-muted py-2" role="region" aria-label={content.read.lines(result.path)} tabIndex={0}>
      <table className="w-full border-collapse font-mono text-xs leading-relaxed"><tbody>
        {result.lines.map((line) => <tr key={line.number} data-line-number={line.number}>
          <td className="w-px px-2.5 text-right align-top text-muted-foreground select-none" aria-hidden="true">{line.number}</td>
          <td className="pr-2.5 align-top whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]">{line.text || "\u00a0"}</td>
        </tr>)}
      </tbody></table>
    </div>}
    <p className="mt-1 mb-0 text-[11px] text-secondary-foreground">
      {end >= result.total_lines ? content.read.end(result.total_lines)
        : result.truncated_by_bytes ? content.read.capped(result.offset, end, end + 1)
        : content.read.window(result.offset, end, result.total_lines, end + 1)}
    </p>
  </div>;
}
