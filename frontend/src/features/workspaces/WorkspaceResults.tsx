import {
  ChevronLeft,
  ChevronRight,
  Expand,
  FileSearch,
  Layers,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import { OutputCard } from "@/features/analysis/OutputCard";
import { productReferences } from "@/features/analysis/product-metadata";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import type { SessionSummary } from "@/features/sessions/api";
import { OverviewDialog } from "@/features/workspaces/overview/OverviewDialog";
import { DeleteResultDialog } from "@/features/workspaces/overview/DeleteResultDialog";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";

export function WorkspaceResults({
  outputs,
  workspaceId,
  sessions,
  originSessionId,
  selectedId,
  onSelect,
  onLocate,
}: {
  readonly outputs: readonly AnalysisOutput[];
  readonly workspaceId: string;
  readonly sessions: readonly SessionSummary[];
  readonly originSessionId: string | null;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onLocate: (path: string) => void;
}) {
  const visible = outputs.filter(
    (output) =>
      output.metadata.bundle_id === undefined ||
      output.metadata.bundle_id === output.id,
  );
  const selected = outputs.find((output) => output.id === selectedId);
  const rootId =
    typeof selected?.metadata.bundle_id === "string"
      ? selected.metadata.bundle_id
      : selectedId;
  const index = Math.max(
    0,
    visible.findIndex((output) => output.id === rootId),
  );
  const output = visible[index];
  const [detailId, setDetailId] = useState<string | null>(null);
  const [removal, setRemoval] = useState<AnalysisOutput | null>(null);
  const detail = outputs.find((item) => item.id === detailId);
  const move = (direction: number) => {
    const next = visible[(index + direction + visible.length) % visible.length];
    if (next !== undefined) onSelect(next.id);
  };
  return (
    <section
      className="overview-panel overview-results"
      aria-label={copy.results}
    >
      <header className="overview-panel-heading">
        <span className="overview-icon">
          <Layers />
        </span>
        <div>
          <h2>{copy.results}</h2>
          <p>{copy.resultHint}</p>
        </div>
        <span className="overview-caption ml-auto">
          {copy.resultCount(visible.length)}
        </span>
      </header>
      {output === undefined ? (
        <div className="overview-empty">
          <span className="overview-empty-mark">
            <Layers strokeWidth={1.25} />
          </span>
          <h3>{copy.emptyResults}</h3>
          <p>{copy.emptyResultsHint}</p>
        </div>
      ) : (
        <>
          <div
            className="overview-gallery"
            role="region"
            aria-roledescription="carousel"
            aria-label={copy.results}
            tabIndex={0}
            onKeyDown={(event) => {
              if (
                event.target !== event.currentTarget ||
                !["ArrowLeft", "ArrowRight"].includes(event.key)
              )
                return;
              event.preventDefault();
              move(event.key === "ArrowLeft" ? -1 : 1);
            }}
          >
            {visible.length > 1 && (
              <GalleryImage
                output={visible[(index - 1 + visible.length) % visible.length]!}
                position="previous"
                onClick={() => move(-1)}
              />
            )}
            <GalleryImage
              key={output.id}
              output={output}
              position="current"
              onClick={() => setDetailId(output.id)}
            />
            {visible.length > 1 && (
              <GalleryImage
                output={visible[(index + 1) % visible.length]!}
                position="next"
                onClick={() => move(1)}
              />
            )}
            <span className="overview-gallery-counter">
              {String(index + 1).padStart(2, "0")}{" "}
              <span>/ {String(visible.length).padStart(2, "0")}</span>
            </span>
          </div>
          <div className="overview-result-caption">
            <div className="min-w-0 flex-1">
              <h3 title={output.title}>{output.title}</h3>
              <p>
                {new Date(output.created_at).toLocaleDateString("zh-CN")}
                <span>·</span>
                {productReferences(output.metadata).length > 0
                  ? copy.productCount(productReferences(output.metadata).length)
                  : output.kind === "rgb_raster"
                    ? "RGB"
                    : "GeoTIFF"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              title={copy.locate}
              aria-label={copy.locate}
              onClick={() => onLocate(output.file_path)}
            >
              <FileSearch className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={copy.deleteResult}
              aria-label={copy.deleteResult}
              onClick={() => setRemoval(output)}
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailId(output.id)}
            >
              <Expand className="size-3.5" />
              {copy.details}
            </Button>
          </div>
          <footer className="overview-gallery-nav">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.previous}
              disabled={visible.length < 2}
              onClick={() => move(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="overview-gallery-dots">
              {visible.map((item, number) => (
                <button
                  key={item.id}
                  aria-label={copy.resultPosition(number + 1, visible.length)}
                  aria-current={index === number ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.next}
              disabled={visible.length < 2}
              onClick={() => move(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </footer>
        </>
      )}
      {detail !== undefined && (
        <OverviewDialog title={copy.details} onClose={() => setDetailId(null)}>
          <div className="p-5">
            <OutputCard
              output={detail}
              workspaceId={workspaceId}
              sessionId={
                originSessionId ??
                (sessions.some((session) => session.id === detail.session_id)
                  ? detail.session_id
                  : null)
              }
            />
          </div>
        </OverviewDialog>
      )}
      {removal !== null && (
        <DeleteResultDialog output={removal} onClose={() => setRemoval(null)} />
      )}
    </section>
  );
}
function GalleryImage({
  output,
  position,
  onClick,
}: {
  readonly output: AnalysisOutput;
  readonly position: "previous" | "current" | "next";
  readonly onClick: () => void;
}) {
  const image = useOutputImage(output.workspace_id, output.id);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={`overview-gallery-image overview-gallery-${position}`}
      onClick={onClick}
      aria-label={
        position === "current"
          ? `${copy.details} · ${output.title}`
          : position === "previous"
            ? copy.previous
            : copy.next
      }
    >
      {image.url !== null && !failed ? (
        <img
          src={image.url}
          alt={output.title}
          onError={() => {
            console.error("[overview] Preview failed", output.id);
            setFailed(true);
          }}
        />
      ) : (
        <span className="overview-caption">
          {image.error || failed ? "预览不可用" : copy.loading}
        </span>
      )}
    </button>
  );
}
