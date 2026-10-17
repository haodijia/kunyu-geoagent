import {
  assistantStreamChunkCount,
  parseAssistantStream,
  parseStreamOrigin,
} from "@/features/events/stream/assistant-stream";
import { TrajectoryPayload } from "@/features/events/trajectory/TrajectoryPayload";
import css from "@/features/events/trajectory/inspector/TrajectoryInspector.module.css";
import { content } from "@/features/events/trajectory/inspector/labels";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";

export function streamFor(record: TrajectoryRecord) {
  if (
    (record.kind !== "assistant" && record.source.kind !== "compaction") ||
    record.output === null ||
    typeof record.output !== "object"
  )
    return null;
  const output = record.output as { stream: unknown; stream_origin: unknown };
  if (output.stream === null) return null;
  return {
    records: parseAssistantStream(output.stream),
    origin: parseStreamOrigin(output.stream_origin),
  };
}

export function StreamDetails({ record }: { record: TrajectoryRecord }) {
  const stream = streamFor(record);
  if (stream === null)
    throw new Error("Stream details require a settled assistant attempt.");
  return (
    <>
      <dl className={css.overview}>
        <div>
          <dt>{content.streamDetails.origin}</dt>
          <dd>
            {stream.origin === "model"
              ? content.streamDetails.model
              : content.streamDetails.buffered}
          </dd>
        </div>
        <div>
          <dt>{content.streamDetails.chunks}</dt>
          <dd>{assistantStreamChunkCount(stream.records)}</dd>
        </div>
        <div>
          <dt>{content.streamDetails.records}</dt>
          <dd>{stream.records.length}</dd>
        </div>
      </dl>
      {stream.origin === "buffered" && (
        <p className="mb-3 text-xs text-muted-foreground">
          {content.streamDetails.historicalTiming}
        </p>
      )}
      <TrajectoryPayload value={stream.records} tree />
    </>
  );
}
