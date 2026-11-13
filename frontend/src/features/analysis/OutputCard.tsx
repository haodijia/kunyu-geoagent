import { refSetter } from "@/lib/lifecycle";
import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";
import { computed, defineComponent, shallowRef } from "vue";
import type { AnalysisOutput } from "./api";
import { rasterView } from "./raster-views";
import { RasterOutputCard } from "./RasterOutputCard";
import { RasterViewPicker } from "./RasterViewPicker";
type OutputProps = {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
  readonly sessionId: string | null;
  readonly compact?: boolean;
};
export const OutputCard = defineComponent(
  (props: OutputProps, { slots: _slots }) => {
    return () => {
      return (
        <RasterViewer
          {...props}
          key={`${props.output.id}:${props.output.revision}`}
        />
      );
    };
  },
  {
    name: "OutputCard",
    inheritAttrs: false,
    props: ["output", "workspaceId", "sessionId", "compact"],
  },
);
const RasterViewer = defineComponent(
  (props: OutputProps, { slots: _slots }) => {
    const selected = shallowRef(props.output.metadata.default_view),
      setSelected = refSetter(selected);
    const view = computed(() => rasterView(props.output, selected.value));
    return () => {
      const _view = view.value;
      return (
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 text-sm font-medium">
            <span>{props.output.title}</span>
            <span class="text-xs font-normal text-muted-foreground">
              {copy.description(
                props.output.metadata.band_count,
                props.output.metadata.views.length,
              )}
            </span>
          </div>
          <RasterViewPicker
            views={props.output.metadata.views}
            selected={selected.value}
            onSelect={setSelected}
          />
          <RasterOutputCard {...props} view={_view} key={_view.id} />
          <p class="text-xs text-muted-foreground">{copy.reuse}</p>
        </div>
      );
    };
  },
  {
    name: "RasterViewer",
    inheritAttrs: false,
    props: ["output", "workspaceId", "sessionId", "compact"],
  },
);
