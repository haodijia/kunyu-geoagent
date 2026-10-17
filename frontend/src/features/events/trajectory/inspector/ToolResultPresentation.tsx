import { FileMutationResult } from "@/features/agent/tools/results/FileMutationResult";
import { ImageReadResult } from "@/features/agent/tools/results/ImageReadResult";
import { ReadResult } from "@/features/agent/tools/results/ReadResult";
import { SearchResult } from "@/features/agent/tools/results/SearchResult";
import {
  parseToolContent,
  toolContentImages,
  toolContentText,
} from "@/features/agent/tools/tool-content";
import { AnalysisToolResult } from "@/features/analysis/AnalysisToolResult";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { useMemo } from "react";

export function ToolResultPresentation({
  record,
}: {
  readonly record: TrajectoryRecord;
}) {
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const offloads = useMemo(() => collectImageOffloads(records), [records]);
  const output = record.output;
  if (
    record.kind !== "tool" ||
    output === null ||
    typeof output !== "object" ||
    !("content" in output)
  )
    return null;
  if (
    "result" in output &&
    output.result !== null &&
    typeof output.result === "object" &&
    ("analysis_job_id" in output.result ||
      "analysis_output_id" in output.result)
  )
    return <AnalysisToolResult value={output.result} sessionId={session.id} />;
  if (
    (record.source.tool_name === "oge_execute_code" ||
      record.source.tool_name === "job_output") &&
    "result" in output &&
    output.result !== null &&
    typeof output.result === "object" &&
    "result" in output.result
  )
    return (
      <AnalysisToolResult value={output.result.result} sessionId={session.id} />
    );
  if (record.source.tool_name === "read") {
    if (!("result" in output))
      throw new Error("Read result has no presentation metadata.");
    return (
      <ReadResult
        value={output.result}
        text={toolContentText(parseToolContent(output.content))}
      />
    );
  }
  if (
    record.source.tool_name === "write" ||
    record.source.tool_name === "edit"
  ) {
    if (!("result" in output))
      throw new Error("File mutation result has no presentation metadata.");
    if (typeof record.source.tool_call_id !== "string")
      throw new Error("File mutation result has no source identity.");
    return (
      <FileMutationResult
        value={output.result}
        text={toolContentText(parseToolContent(output.content))}
      />
    );
  }
  if (
    record.source.tool_name === "glob" ||
    record.source.tool_name === "grep"
  ) {
    if (!("result" in output))
      throw new Error("Search result has no presentation metadata.");
    return (
      <SearchResult
        value={output.result}
        text={toolContentText(parseToolContent(output.content))}
      />
    );
  }
  const blocks = parseToolContent(output.content);
  const images = toolContentImages(blocks);
  const id = record.source.tool_call_id;
  if (record.source.tool_name === "read_image") {
    if (!("result" in output))
      throw new Error("Image read result has no presentation metadata.");
    if (typeof id !== "string")
      throw new Error("Tool image result has no source identity.");
    return (
      <ImageReadResult
        value={output.result}
        text={toolContentText(blocks)}
        images={images}
        sessionId={session.id}
        offloadedIds={offloads.get(id)}
      />
    );
  }
  if (images.length === 0) return null;
  if (typeof id !== "string")
    throw new Error("Tool image result has no source identity.");
  return (
    <AttachmentStrip
      sessionId={session.id}
      attachments={images}
      offloadedIds={offloads.get(id)}
    />
  );
}
