import { ResultSummary } from "./ResultSummary";
import { useState } from "react";
import type { AnalysisOutput } from "./api";
import { RasterOutputCard } from "./RasterOutputCard";
import { RasterViewPicker } from "./RasterViewPicker";
import { rasterView } from "./raster-views";
import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";

type OutputProps = {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
  readonly sessionId: string | null;
  readonly compact?: boolean;
};
export function OutputCard(props: OutputProps) {
  return (
    <RasterViewer
      {...props}
      key={`${props.output.id}:${props.output.revision}`}
    />
  );
}
function RasterViewer(props: OutputProps) {
  const [selected, setSelected] = useState(props.output.metadata.default_view);
  const view = rasterView(props.output, selected);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm font-medium">
        <span>{props.output.title}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {copy.description(
            props.output.metadata.band_count,
            props.output.metadata.views.length,
          )}
        </span>
      </div>
      {!props.compact && (
        <ResultSummary output={props.output} sessionId={props.sessionId} />
      )}
      <RasterViewPicker
        views={props.output.metadata.views}
        selected={selected}
        onSelect={setSelected}
      />
      <RasterOutputCard {...props} view={view} key={view.id} />
      <p className="text-xs text-muted-foreground">{copy.reuse}</p>
    </div>
  );
}
