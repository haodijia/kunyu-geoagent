import { ToolResultView } from "@/features/agent/tools/ToolResultView";
import { parseToolDisplay } from "@/features/agent/tools/tool-output";
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { computed, defineComponent, toRefs } from "vue";
export const ToolResultPresentation = defineComponent(
  (
    componentProps: {
      readonly record: TrajectoryRecord;
    },
    { slots: _slots },
  ) => {
    const record = computed(() => componentProps.record);
    const session = useSessionWorkspace();
    const { records } = toRefs(useSessionEvents());
    const offloads = computed(() => collectImageOffloads(records.value));
    const output = computed(() => record.value.output);
    const id = computed(() => record.value.source.tool_call_id);
    return () => {
      const _record = record.value,
        _output = output.value,
        _id = id.value,
        _offloads = offloads.value;
      if (
        _record.kind !== "tool" ||
        _output === null ||
        typeof _output !== "object" ||
        !("content" in _output)
      )
        return null;
      if (!("display" in _output) || typeof _id !== "string")
        throw new Error(
          "Tool result has no frontend projection or source identity.",
        );
      return (
        <ToolResultView
          display={parseToolDisplay(_output.display)}
          sessionId={session.id}
          toolCallId={_id}
          offloadedIds={_offloads.get(_id)}
        />
      );
    };
  },
  {
    name: "ToolResultPresentation",
    inheritAttrs: false,
    props: ["record"],
  },
);
