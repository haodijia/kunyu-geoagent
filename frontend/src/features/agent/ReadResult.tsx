import { zhCN } from "@/locales/zh-CN";
import { parseReadResult } from "./read-result";
import { ToolResultPanel } from "./ToolActivityParts";

const content = zhCN.conversation.tools;

export function ReadResult({ value, text }: { readonly value: unknown; readonly text: string }) {
  const result = parseReadResult(value);
  const end = result.lines.at(-1)?.number ?? Math.max(0, result.offset - 1);
  return <div className="min-w-0" data-read-path={result.path}>
    <ToolResultPanel label={`${result.path}${result.lang === undefined ? "" : ` · ${result.lang}`}`} copyText={text}>
    {result.lines.length > 0 && <div className="max-h-80 overflow-auto py-2" role="region" aria-label={content.read.lines(result.path)} tabIndex={0}>
      <table className="w-full border-collapse font-mono text-xs leading-relaxed"><tbody>
        {result.lines.map((line) => <tr key={line.number} data-line-number={line.number}>
          <td className="w-px px-2.5 text-right align-top text-muted-foreground select-none" aria-hidden="true">{line.number}</td>
          <td className="pr-2.5 align-top whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]">{line.text || "\u00a0"}</td>
        </tr>)}
      </tbody></table>
    </div>}
    <p className="m-0 border-t border-border px-3 py-1.5 text-[11px] text-secondary-foreground">
      {end >= result.total_lines ? content.read.end(result.total_lines)
        : result.truncated_by_bytes ? content.read.capped(result.offset, end, end + 1)
        : content.read.window(result.offset, end, result.total_lines, end + 1)}
    </p>
    </ToolResultPanel>
  </div>;
}
