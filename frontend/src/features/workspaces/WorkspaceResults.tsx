import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import { OutputCard } from "@/features/analysis/OutputCard";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import type { SessionSummary } from "@/features/sessions/api";
import { DeleteResultDialog } from "@/features/workspaces/overview/DeleteResultDialog";
import { OverviewDialog } from "@/features/workspaces/overview/OverviewDialog";
import { refSetter } from "@/lib/lifecycle";
import { rasterCopy } from "@/locales/zh-CN/raster-views";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  FileSearch,
  Layers,
  Trash2,
} from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
export const WorkspaceResults = defineComponent(
  (
    componentProps: {
      readonly outputs: readonly AnalysisOutput[];
      readonly workspaceId: string;
      readonly sessions: readonly SessionSummary[];
      readonly originSessionId: string | null;
      readonly selectedId: string | null;
      readonly onSelect: (id: string) => void;
      readonly onLocate: (path: string) => void;
    },
    { slots: _slots },
  ) => {
    const outputs = computed(() => componentProps.outputs),
      workspaceId = computed(() => componentProps.workspaceId),
      sessions = computed(() => componentProps.sessions),
      originSessionId = computed(() => componentProps.originSessionId),
      selectedId = computed(() => componentProps.selectedId),
      onSelect = computed(() => componentProps.onSelect),
      onLocate = computed(() => componentProps.onLocate);
    const visible = computed(() => outputs.value);
    const index = computed(() =>
      Math.max(
        0,
        visible.value.findIndex((output) => output.id === selectedId.value),
      ),
    );
    const output = computed(() => visible.value[index.value]);
    const detailId = shallowRef<string | null>(null),
      setDetailId = refSetter(detailId);
    const removal = shallowRef<AnalysisOutput | null>(null),
      setRemoval = refSetter(removal);
    const detail = computed(() =>
      outputs.value.find((item) => item.id === detailId.value),
    );
    const move = (direction: number) => {
      const next =
        visible.value[
          (index.value + direction + visible.value.length) %
            visible.value.length
        ];
      if (next !== undefined) onSelect.value(next.id);
    };
    return () => {
      const _visible = visible.value,
        _output = output.value,
        _index = index.value,
        _onLocate = onLocate.value,
        _onSelect = onSelect.value,
        _detail = detail.value,
        _workspaceId = workspaceId.value,
        _originSessionId = originSessionId.value,
        _sessions = sessions.value;
      return (
        <section
          class="overview-panel overview-results"
          aria-label={copy.results}
        >
          <header class="overview-panel-heading">
            <span class="overview-icon">
              <Layers />
            </span>
            <div>
              <h2>{copy.results}</h2>
              <p>{copy.resultHint}</p>
            </div>
            <span class="overview-caption ml-auto">
              {copy.resultCount(_visible.length)}
            </span>
          </header>
          {_output === undefined ? (
            <div class="overview-empty">
              <span class="overview-empty-mark">
                <Layers strokeWidth={1.25} />
              </span>
              <h3>{copy.emptyResults}</h3>
              <p>{copy.emptyResultsHint}</p>
            </div>
          ) : (
            <>
              <div
                class="overview-gallery"
                role="region"
                aria-roledescription="carousel"
                aria-label={copy.results}
                tabindex={0}
                onKeydown={(event) => {
                  if (
                    event.target !== event.currentTarget ||
                    !["ArrowLeft", "ArrowRight"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  move(event.key === "ArrowLeft" ? -1 : 1);
                }}
              >
                {_visible.length > 1 && (
                  <GalleryImage
                    output={
                      _visible[
                        (_index - 1 + _visible.length) % _visible.length
                      ]!
                    }
                    position="previous"
                    onClick={() => move(-1)}
                  />
                )}
                <GalleryImage
                  key={`${_output.id}:${_output.revision}`}
                  output={_output}
                  position="current"
                  onClick={() => setDetailId(_output.id)}
                />
                {_visible.length > 1 && (
                  <GalleryImage
                    output={_visible[(_index + 1) % _visible.length]!}
                    position="next"
                    onClick={() => move(1)}
                  />
                )}
                <span class="overview-gallery-counter">
                  {String(_index + 1).padStart(2, "0")}{" "}
                  <span>/ {String(_visible.length).padStart(2, "0")}</span>
                </span>
              </div>
              <div class="overview-result-caption">
                <div class="min-w-0 flex-1">
                  <h3 title={_output.title}>{_output.title}</h3>
                  <p>
                    {new Date(_output.created_at).toLocaleDateString("zh-CN")}
                    <span>·</span>
                    {rasterCopy.description(
                      _output.metadata.band_count,
                      _output.metadata.views.length,
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={copy.locate}
                  aria-label={copy.locate}
                  onClick={() => _onLocate(_output.file_path)}
                >
                  <FileSearch class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={copy.deleteResult}
                  aria-label={copy.deleteResult}
                  onClick={() => setRemoval(_output)}
                >
                  <Trash2 class="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailId(_output.id)}
                >
                  <Expand class="size-3.5" />
                  {copy.details}
                </Button>
              </div>
              <footer class="overview-gallery-nav">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy.previous}
                  disabled={_visible.length < 2}
                  onClick={() => move(-1)}
                >
                  <ChevronLeft class="size-4" />
                </Button>
                <div class="overview-gallery-dots">
                  {_visible.map((item, number) => (
                    <button
                      key={item.id}
                      aria-label={copy.resultPosition(
                        number + 1,
                        _visible.length,
                      )}
                      aria-current={_index === number ? "true" : undefined}
                      onClick={() => _onSelect(item.id)}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy.next}
                  disabled={_visible.length < 2}
                  onClick={() => move(1)}
                >
                  <ChevronRight class="size-4" />
                </Button>
              </footer>
            </>
          )}
          {_detail !== undefined && (
            <OverviewDialog
              title={copy.details}
              onClose={() => setDetailId(null)}
            >
              <div class="p-5">
                <OutputCard
                  output={_detail}
                  workspaceId={_workspaceId}
                  sessionId={
                    _originSessionId ??
                    (_sessions.some(
                      (session) => session.id === _detail.session_id,
                    )
                      ? _detail.session_id
                      : null)
                  }
                />
              </div>
            </OverviewDialog>
          )}
          {removal.value !== null && (
            <DeleteResultDialog
              output={removal.value}
              onClose={() => setRemoval(null)}
            />
          )}
        </section>
      );
    };
  },
  {
    name: "WorkspaceResults",
    inheritAttrs: false,
    props: [
      "outputs",
      "workspaceId",
      "sessions",
      "originSessionId",
      "selectedId",
      "onSelect",
      "onLocate",
    ],
  },
);
const GalleryImage = defineComponent(
  (
    componentProps: {
      readonly output: AnalysisOutput;
      readonly position: "previous" | "current" | "next";
      readonly onClick: () => void;
    },
    { slots: _slots },
  ) => {
    const output = computed(() => componentProps.output),
      position = computed(() => componentProps.position),
      onClick = computed(() => componentProps.onClick);
    const image = useOutputImage(
      () => output.value.workspace_id,
      () => output.value.id,
      () => output.value.metadata.default_view,
      () => output.value.revision,
    );
    const failed = shallowRef(false),
      setFailed = refSetter(failed);
    return () => {
      const _position = position.value,
        _onClick = onClick.value,
        _output2 = output.value;
      return (
        <button
          type="button"
          class={`overview-gallery-image overview-gallery-${_position}`}
          onClick={_onClick}
          aria-label={
            _position === "current"
              ? `${copy.details} · ${_output2.title}`
              : _position === "previous"
                ? copy.previous
                : copy.next
          }
        >
          {image.url !== null && !failed.value ? (
            <img
              src={image.url}
              alt={_output2.title}
              onError={() => {
                console.error("[overview] Preview failed", _output2.id);
                setFailed(true);
              }}
            />
          ) : (
            <span class="overview-caption">
              {image.error || failed.value ? "预览不可用" : copy.loading}
            </span>
          )}
        </button>
      );
    };
  },
  {
    name: "GalleryImage",
    inheritAttrs: false,
    props: ["output", "position", "onClick"],
  },
);
