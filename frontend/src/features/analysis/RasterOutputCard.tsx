import { useNavigation } from "@/app/navigation";
import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import {
  analysisApi,
  analysisKeys,
  type AnalysisOutput,
} from "@/features/analysis/api";
import { RasterBandSummary } from "@/features/analysis/RasterBandSummary";
import { referenceOutput } from "@/features/analysis/result-reference";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import { ImageLightbox } from "@/features/attachments/ImageLightbox";
import { sessionMapPath } from "@/features/sessions/routes";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { rasterCopy } from "@/locales/zh-CN/raster-views";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { Download, LocateFixed, MessageSquarePlus } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { colorRamps, type RasterView } from "./raster-views";
const content = zhCN.analysis;
export const RasterOutputCard = defineComponent(
  (
    componentProps: {
      readonly output: AnalysisOutput;
      readonly view: RasterView;
      readonly workspaceId: string;
      readonly sessionId: string | null;
      readonly compact?: boolean;
    },
    { slots: _slots },
  ) => {
    const output = computed(() => componentProps.output),
      view = computed(() => componentProps.view),
      workspaceId = computed(() => componentProps.workspaceId),
      sessionId = computed(() => componentProps.sessionId),
      compact = computed(() =>
        componentProps.compact === undefined ? false : componentProps.compact,
      );
    const image = useOutputImage(
      () => output.value.workspace_id,
      () => output.value.id,
      () => view.value.id,
      () => output.value.revision,
    );
    const client = useQueryClient();
    const navigate = useNavigation();
    const open = shallowRef(false),
      setOpen = refSetter(open);
    const detailsOpen = shallowRef(false),
      setDetailsOpen = refSetter(detailsOpen);
    const sourceOpen = shallowRef(false),
      setSourceOpen = refSetter(sourceOpen);
    const decodeFailed = shallowRef(false),
      setDecodeFailed = refSetter(decodeFailed);
    const error = shallowRef<string | null>(null),
      setError = refSetter(error);
    const categories = computed(() =>
      view.value.style.type === "classified" ? view.value.style.classes : [],
    );
    const description = computed(() =>
      view.value.style.type !== "rgb"
        ? content.scalarDescription
        : content.rgbDescription,
    );
    const mutation = reactive(
      useMutation({
        mutationFn: async (action: "map" | "download" | "preview") => {
          if (action === "map") {
            if (sessionId.value === null)
              throw new Error("An active session is required.");
            const layer = await analysisApi.addLayer(
              sessionId.value,
              output.value.id,
              view.value.id,
            );
            const ui = useAppUiStore();
            ui.initializeMapContext(sessionId.value, workspaceId.value);
            ui.inspectMapLayer(sessionId.value, layer.id);
            ui.setMapComparison(sessionId.value, null);
            ui.focusMap(sessionId.value, output.value.bounds);
            await client.invalidateQueries({
              queryKey: analysisKeys.layers(sessionId.value),
            });
            void navigate(sessionMapPath(workspaceId.value, sessionId.value));
          } else {
            const blob =
              action === "download"
                ? await analysisApi.download(
                    output.value.workspace_id,
                    output.value.id,
                  )
                : await analysisApi.preview(
                    output.value.workspace_id,
                    output.value.id,
                    view.value.id,
                  );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${output.value.title}.${action === "preview" ? "png" : "tif"}`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        },
        onMutate: () => setError(null),
        onError: (reason) => {
          console.error("[analysis] Result action failed", {
            outputId: output.value.id,
            reason,
          });
          setError(reason.message);
        },
      }),
    );
    function imageFailed() {
      console.error("[analysis] Preview decoding failed", {
        outputId: output.value.id,
      });
      setDecodeFailed(true);
      setOpen(false);
    }
    return () => {
      const _output = output.value,
        _view = view.value,
        _compact = compact.value,
        _categories = categories.value,
        _sessionId = sessionId.value,
        _description = description.value;
      return (
        <section
          class="min-w-0 space-y-2 py-2"
          data-analysis-output={_output.id}
        >
          <p class="text-sm font-medium">{_view.title}</p>
          {image.url !== null && !decodeFailed.value ? (
            <button
              type="button"
              class="block w-full rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setOpen(true)}
              aria-label={zhCN.conversation.attachments.preview(_view.title)}
            >
              <img
                class={`w-full rounded-md object-contain ${_compact ? "max-h-64" : "max-h-96"}`}
                src={image.url}
                alt={_view.title}
                onError={imageFailed}
              />
            </button>
          ) : (
            <p
              class="rounded bg-muted px-3 py-5 text-xs text-muted-foreground"
              role="status"
            >
              {image.error || decodeFailed.value
                ? content.previewFailed
                : content.loading}
            </p>
          )}
          {_categories.length > 0 ? (
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {_categories.map((entry) => (
                <span key={entry.value} class="flex items-center gap-1">
                  <span
                    class="size-2.5 rounded-sm"
                    style={{
                      backgroundColor: entry.color,
                    }}
                  />
                  {entry.label}
                </span>
              ))}
            </div>
          ) : (
            _view.style.type === "continuous" &&
            Array.isArray(_view.render_ranges[0]) && (
              <div
                class="text-[10px] text-muted-foreground"
                aria-label={content.displayRange}
              >
                <div
                  class="h-1.5 rounded-full"
                  style={{
                    background: colorRamps[_view.style.color_ramp],
                  }}
                />
                <div class="mt-1 flex justify-between">
                  {_view.render_ranges[0].map((value, index) => (
                    <span key={index}>{Number(value).toPrecision(4)}</span>
                  ))}
                </div>
              </div>
            )
          )}
          {_view.description.length > 0 && (
            <p class="text-xs leading-5 text-muted-foreground">
              {_view.description}
            </p>
          )}
          <p class="text-[10px] text-muted-foreground">
            {rasterCopy.bands}:{" "}
            {_view.bands
              .map((index) => _output.metadata.bands[index - 1]!.title)
              .join(" / ")}
          </p>
          <RasterBandSummary output={_output} view={_view} />
          <div class="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.isPending || _sessionId === null}
              onClick={() => mutation.mutate("map")}
            >
              <LocateFixed class="size-3.5" />
              {content.viewMap}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("download")}
            >
              <Download class="size-3.5" />
              {rasterCopy.source}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={_sessionId === null}
              onClick={() => {
                if (_sessionId !== null)
                  referenceOutput(_sessionId, _output, _view.id);
              }}
            >
              <MessageSquarePlus class="size-3.5" />
              {content.continueQuestion}
            </Button>
          </div>
          <details
            class="text-xs text-muted-foreground"
            onToggle={(event) =>
              setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary class="cursor-pointer py-1">
              {content.resultDetails}
            </summary>
            {detailsOpen.value && (
              <div class="space-y-2 pt-2">
                <p class="leading-5">{_description}</p>
                <p>
                  {String(_output.metadata.width)} ×{" "}
                  {String(_output.metadata.height)} ·{" "}
                  {String(_output.metadata.crs)} · {_output.metadata.band_count}{" "}
                  {content.bands}
                </p>
                <p>{_output.file_path}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate("preview")}
                >
                  {content.downloadPreview}
                </Button>
                <details
                  onToggle={(event) =>
                    setSourceOpen(
                      (event.currentTarget as HTMLDetailsElement).open,
                    )
                  }
                >
                  <summary class="cursor-pointer">{content.provenance}</summary>
                  <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                    {sourceOpen.value
                      ? JSON.stringify(_output.source_metadata, null, 2)
                      : ""}
                  </pre>
                </details>
              </div>
            )}
          </details>
          {error.value !== null && (
            <p role="alert" class="text-xs text-destructive">
              {error.value}
            </p>
          )}
          {open.value && image.url !== null && (
            <ImageLightbox
              src={image.url}
              name={_view.title}
              description={_description}
              onClose={() => setOpen(false)}
              onError={imageFailed}
            />
          )}
        </section>
      );
    };
  },
  {
    name: "RasterOutputCard",
    inheritAttrs: false,
    props: ["output", "view", "workspaceId", "sessionId", "compact"],
  },
);
