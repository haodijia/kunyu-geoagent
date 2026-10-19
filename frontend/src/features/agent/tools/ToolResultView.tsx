import { TodoItems } from "@/features/agent/plan/TodoItems";
import { parseTodos } from "@/features/agent/plan/todos";
import { AnalysisResult } from "@/features/agent/tools/results/AnalysisResult";
import { FileMutationResult } from "@/features/agent/tools/results/FileMutationResult";
import { ImageReadResult } from "@/features/agent/tools/results/ImageReadResult";
import { ReadResult } from "@/features/agent/tools/results/ReadResult";
import { SearchResult } from "@/features/agent/tools/results/SearchResult";
import type { ToolDisplay } from "@/features/agent/tools/tool-output";
import { ToolDetail } from "@/features/agent/tools/ToolActivityParts";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { SubagentCard } from "@/features/subagents/SubagentCard";

export function ToolResultView({ display, sessionId, toolCallId, offloadedIds }: {
  readonly display: ToolDisplay;
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly offloadedIds?: ReadonlySet<string>;
}) {
  switch (display.kind) {
    case "none": return null;
    case "code": return <ToolDetail label={display.summary}>{display.text}</ToolDetail>;
    case "text": return <p className="m-0 whitespace-pre-wrap text-xs leading-5 text-secondary-foreground [overflow-wrap:anywhere]">{display.text}</p>;
    case "analysis": return <AnalysisResult jobId={display.job_id} sessionId={sessionId} />;
    case "read": return <ReadResult value={display.data} text={display.text} />;
    case "search": return <SearchResult value={display.data} text={display.text} />;
    case "file_change": return <FileMutationResult value={display.data} text={display.text} />;
    case "image_read": return <ImageReadResult value={display.data} text={display.text} images={display.images} sessionId={sessionId} offloadedIds={offloadedIds} />;
    case "images": return <div className="space-y-1">
      <AttachmentStrip sessionId={sessionId} attachments={display.images} offloadedIds={offloadedIds} imageLayout="preview" />
      <p className="m-0 text-xs leading-5 text-secondary-foreground">{display.description}</p>
    </div>;
    case "todos": {
      const data = display.data;
      if (data === null || typeof data !== "object" || !("todos" in data)) throw new Error("Task presentation has no tasks.");
      return <TodoItems items={parseTodos(data.todos)} />;
    }
    case "subagent": return <SubagentCard toolCallId={toolCallId} />;
  }
}
