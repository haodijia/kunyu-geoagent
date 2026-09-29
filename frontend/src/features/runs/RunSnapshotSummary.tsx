import { Brain, MapPinned, SlidersHorizontal } from "lucide-react";

import type { RunMapContext, RunSnapshot } from "@/features/runs/api";
import { providerName } from "@/features/settings/models/provider-copy";
import { zhCN } from "@/locales/zh-CN";

export function RunSnapshotSummary({ run }: { readonly run: RunSnapshot }) {
  const snapshot = run.model_snapshot;
  return (
    <div className="mt-2 flex max-w-full flex-wrap justify-end gap-x-3 gap-y-1 px-1 text-[11px] leading-4 text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1" title={snapshot.base_url}>
        <Brain className="size-3" aria-hidden="true" />
        <span className="truncate">
          {providerName[snapshot.provider_type]} · {snapshot.model_id}
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <SlidersHorizontal className="size-3" aria-hidden="true" />
        {snapshot.reasoning_effort === null
          ? zhCN.conversation.reasoningNotSpecified
          : zhCN.conversation.reasoningValue(snapshot.reasoning_effort)}
        <span aria-hidden="true">·</span>
        {zhCN.conversation.connectionRevision(snapshot.connection_revision)}
      </span>
      <span className="inline-flex items-center gap-1">
        <MapPinned className="size-3" aria-hidden="true" />
        {mapContextLabel(run.map_context)}
      </span>
    </div>
  );
}

export function mapContextLabel(context: RunMapContext): string {
  const { latitude, longitude, zoom } = context.viewport;
  return zhCN.conversation.mapViewport(
    longitude.toFixed(4),
    latitude.toFixed(4),
    zoom.toFixed(1)
  );
}
