import {
  assistantStreamChunkCount,
  parseAssistantStream,
  parseStreamOrigin,
} from "@/features/events/stream/assistant-stream";
import { TrajectoryPayload } from "@/features/events/trajectory/TrajectoryPayload";
import css from "@/features/events/trajectory/inspector/TrajectoryInspector.module.css";
import { content } from "@/features/events/trajectory/inspector/labels";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { computed, defineComponent } from "vue";
export function streamFor(record: TrajectoryRecord) {
  if (
    (record.kind !== "assistant" && record.source.kind !== "compaction") ||
    record.output === null ||
    typeof record.output !== "object"
  )
    return null;
  const output = record.output as {
    stream: unknown;
    stream_origin: unknown;
  };
  if (output.stream === null) return null;
  return {
    records: parseAssistantStream(output.stream),
    origin: parseStreamOrigin(output.stream_origin),
  };
}
export const StreamDetails = defineComponent(
  (
    componentProps: {
      record: TrajectoryRecord;
    },
    { slots: _slots },
  ) => {
    const record = computed(() => componentProps.record);
    const stream = computed(() => streamFor(record.value));
    if (stream.value === null)
      throw new Error("Stream details require a settled assistant attempt.");
    return () => {
      const _stream = stream.value;
      if (_stream === null)
        throw new Error("Stream details require a settled assistant attempt.");
      return (
        <>
          <dl class={css.overview}>
            <div>
              <dt>{content.streamDetails.origin}</dt>
              <dd>
                {_stream.origin === "model"
                  ? content.streamDetails.model
                  : content.streamDetails.buffered}
              </dd>
            </div>
            <div>
              <dt>{content.streamDetails.chunks}</dt>
              <dd>{assistantStreamChunkCount(_stream.records)}</dd>
            </div>
            <div>
              <dt>{content.streamDetails.records}</dt>
              <dd>{_stream.records.length}</dd>
            </div>
          </dl>
          {_stream.origin === "buffered" && (
            <p class="mb-3 text-xs text-muted-foreground">
              {content.streamDetails.historicalTiming}
            </p>
          )}
          <TrajectoryPayload value={_stream.records} tree />
        </>
      );
    };
  },
  {
    name: "StreamDetails",
    inheritAttrs: false,
    props: ["record"],
  },
);
