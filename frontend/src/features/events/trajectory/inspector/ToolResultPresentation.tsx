import { ToolResultView } from "@/features/agent/tools/ToolResultView";
import { parseToolDisplay } from "@/features/agent/tools/tool-output";
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { useMemo } from "react";

export function ToolResultPresentation({ record }: { readonly record: TrajectoryRecord }) {
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const offloads = useMemo(() => collectImageOffloads(records), [records]);
  const output = record.output;
  if (record.kind !== "tool" || output === null || typeof output !== "object" || !("content" in output)) return null;
  if (!("display" in output) || typeof record.source.tool_call_id !== "string")
    throw new Error("Tool result has no frontend projection or source identity.");
  const id = record.source.tool_call_id;
  return <ToolResultView display={parseToolDisplay(output.display)} sessionId={session.id} toolCallId={id} offloadedIds={offloads.get(id)} />;
}
