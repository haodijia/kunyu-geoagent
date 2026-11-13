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
import { computed, defineComponent } from "vue";
export const ToolResultView = defineComponent(
  (
    componentProps: {
      readonly display: ToolDisplay;
      readonly sessionId: string;
      readonly toolCallId: string;
      readonly offloadedIds?: ReadonlySet<string>;
    },
    { slots: _slots },
  ) => {
    const display = computed(() => componentProps.display),
      sessionId = computed(() => componentProps.sessionId),
      toolCallId = computed(() => componentProps.toolCallId),
      offloadedIds = computed(() => componentProps.offloadedIds);
    return () => {
      const _display = display.value,
        _sessionId = sessionId.value,
        _offloadedIds = offloadedIds.value,
        _toolCallId = toolCallId.value;
      switch (_display.kind) {
        case "none":
          return null;
        case "code":
          return <ToolDetail label={_display.summary} text={_display.text} />;
        case "text":
          return (
            <p class="m-0 whitespace-pre-wrap text-xs leading-5 text-secondary-foreground [overflow-wrap:anywhere]">
              {_display.text}
            </p>
          );
        case "analysis":
          return <AnalysisResult jobId={_display.job_id} />;
        case "read":
          return <ReadResult value={_display.data} text={_display.text} />;
        case "search":
          return <SearchResult value={_display.data} text={_display.text} />;
        case "file_change":
          return (
            <FileMutationResult value={_display.data} text={_display.text} />
          );
        case "image_read":
          return (
            <ImageReadResult
              value={_display.data}
              text={_display.text}
              images={_display.images}
              sessionId={_sessionId}
              offloadedIds={_offloadedIds}
            />
          );
        case "images":
          return (
            <div class="space-y-1">
              <AttachmentStrip
                sessionId={_sessionId}
                attachments={_display.images}
                offloadedIds={_offloadedIds}
                imageLayout="preview"
              />
              <p class="m-0 text-xs leading-5 text-secondary-foreground">
                {_display.description}
              </p>
            </div>
          );
        case "todos": {
          const data = _display.data;
          if (data === null || typeof data !== "object" || !("todos" in data))
            throw new Error("Task presentation has no tasks.");
          return <TodoItems items={parseTodos(data.todos)} />;
        }
        case "subagent":
          return <SubagentCard toolCallId={_toolCallId} />;
      }
    };
  },
  {
    name: "ToolResultView",
    inheritAttrs: false,
    props: ["display", "sessionId", "toolCallId", "offloadedIds"],
  },
);
