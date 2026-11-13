import { Button } from "@/components/ui/button";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { PixelInteraction } from "@/features/maps/analysis/PixelInteraction";
import { RegionInteraction } from "@/features/maps/analysis/RegionInteraction";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { refSetter } from "@/lib/lifecycle";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";
import { X } from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
export interface MapInteraction {
  readonly layerId: string | null;
  readonly mode: "pixel" | "region" | "compare";
}
export const MapInteractions = defineComponent(
  (
    componentProps: {
      readonly value: MapInteraction;
      readonly map: ReturnType<typeof useSessionMap>;
      readonly workspaceId: string;
      readonly sessionId: string;
      readonly layers: readonly MapLayer[];
      readonly outputs: readonly AnalysisOutput[];
      readonly pair: readonly [string, string] | null;
      readonly onPair: (value: readonly [string, string] | null) => void;
      readonly onClose: () => void;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      map = computed(() => componentProps.map),
      workspaceId = computed(() => componentProps.workspaceId),
      sessionId = computed(() => componentProps.sessionId),
      layers = computed(() => componentProps.layers),
      outputs = computed(() => componentProps.outputs),
      pair = computed(() => componentProps.pair),
      onPair = computed(() => componentProps.onPair),
      onClose = computed(() => componentProps.onClose);
    const layer = computed(
      () =>
        layers.value.find((item) => item.id === value.value.layerId) ?? null,
    );
    const props = computed(() => ({
      map: map.value,
      workspaceId: workspaceId.value,
      sessionId: sessionId.value,
      layer: layer.value,
      outputs: outputs.value,
    }));
    return () => {
      const _value = value.value,
        _props = props.value,
        _onClose = onClose.value,
        _layers = layers.value,
        _pair = pair.value,
        _onPair = onPair.value;
      if (_value.mode === "pixel") return <PixelInteraction {..._props} />;
      if (_value.mode === "region") return <RegionInteraction {..._props} />;
      return (
        <aside
          aria-label={copy[_value.mode]}
          class="flex min-h-0 shrink-0 flex-col rounded-xl border border-border bg-background/95 shadow-sm backdrop-blur"
        >
          <div class="flex items-center justify-between border-b border-border px-3 py-2">
            <p class="text-sm font-medium">{copy[_value.mode]}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.close}
              onClick={_onClose}
            >
              <X class="size-4" />
            </Button>
          </div>
          <div class="min-h-0 space-y-3 overflow-y-auto p-3">
            {_value.mode === "compare" && (
              <ComparisonControls
                layers={_layers}
                pair={_pair}
                onPair={_onPair}
              />
            )}
          </div>
        </aside>
      );
    };
  },
  {
    name: "MapInteractions",
    inheritAttrs: false,
    props: [
      "value",
      "map",
      "workspaceId",
      "sessionId",
      "layers",
      "outputs",
      "pair",
      "onPair",
      "onClose",
    ],
  },
);
const ComparisonControls = defineComponent(
  (
    componentProps: {
      readonly layers: readonly MapLayer[];
      readonly pair: readonly [string, string] | null;
      readonly onPair: (value: readonly [string, string] | null) => void;
    },
    { slots: _slots },
  ) => {
    const layers = computed(() => componentProps.layers),
      pair = computed(() => componentProps.pair),
      onPair = computed(() => componentProps.onPair);
    const choice = shallowRef<readonly [string, string]>(
        pair.value ?? ["", ""],
      ),
      setChoice = refSetter(choice);
    const selected = computed(() => pair.value ?? choice.value);
    const eligible = computed(() =>
      layers.value.filter((item) => item.bounds !== null),
    );
    const valid = computed(
      () =>
        selected.value[0] !== selected.value[1] &&
        selected.value.every((id) =>
          eligible.value.some((layer) => layer.id === id),
        ),
    );
    return () => {
      const _eligible = eligible.value,
        _selected = selected.value,
        _onPair2 = onPair.value,
        _pair2 = pair.value,
        _valid = valid.value;
      return (
        <div class="space-y-2 text-xs">
          <p class="text-muted-foreground">
            {_eligible.length < 2 ? copy.comparisonEmpty : copy.comparisonHint}
          </p>
          {([0, 1] as const).map((index) => (
            <label key={index} class="block space-y-1">
              {index === 0 ? copy.left : copy.right}
              <select
                aria-label={index === 0 ? copy.left : copy.right}
                class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={_selected[index]}
                onChange={(event) => {
                  _onPair2(null);
                  setChoice(
                    index === 0
                      ? [(event.target as HTMLInputElement).value, _selected[1]]
                      : [
                          _selected[0],
                          (event.target as HTMLInputElement).value,
                        ],
                  );
                }}
              >
                <option value="">{copy.select}</option>
                {_eligible
                  .filter((item) => item.id !== _selected[index === 0 ? 1 : 0])
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={_pair2 === null && !_valid}
            onClick={() => {
              setChoice(_selected);
              _onPair2(_pair2 === null ? _selected : null);
            }}
          >
            {_pair2 === null ? copy.swipeStart : copy.swipeStop}
          </Button>
          {_pair2 !== null && (
            <p class="text-muted-foreground">{copy.dragDivider}</p>
          )}
        </div>
      );
    };
  },
  {
    name: "ComparisonControls",
    inheritAttrs: false,
    props: ["layers", "pair", "onPair"],
  },
);
