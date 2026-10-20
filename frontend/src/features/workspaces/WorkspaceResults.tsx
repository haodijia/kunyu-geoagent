import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import { OutputCard } from "@/features/analysis/OutputCard";
import {
  getSession,
  sessionQueryKeys,
  type SessionSummary,
} from "@/features/sessions/api";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.overview;

export function WorkspaceResults({
  outputs,
  workspaceId,
  sessions,
  originSessionId,
}: {
  readonly outputs: readonly AnalysisOutput[];
  readonly workspaceId: string;
  readonly sessions: readonly SessionSummary[];
  readonly originSessionId: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const update = () =>
      setEdges({
        left: element.scrollLeft > 1,
        right:
          element.scrollWidth - element.clientWidth - element.scrollLeft > 1,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [outputs]);

  function move(direction: number) {
    const element = scroller.current;
    if (element === null) return;
    const slide = element.firstElementChild;
    if (slide !== null)
      element.scrollBy({
        left: direction * (slide.getBoundingClientRect().width + 24),
        behavior: "smooth",
      });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {content.results}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {outputs.length}
          </span>
        </h2>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={!edges.left}
            aria-label={content.previousResult}
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={!edges.right}
            aria-label={content.nextResult}
            onClick={() => move(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {outputs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          {content.emptyResults}
        </p>
      ) : (
        <div
          ref={scroller}
          role="region"
          aria-label={content.results}
          aria-roledescription={content.carousel}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -1 : 1);
          }}
          className="flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto pb-3 [scrollbar-width:thin]"
        >
          {outputs.map((output, index) => (
            <article
              key={output.id}
              role="group"
              aria-roledescription={content.slide}
              aria-label={`${index + 1} / ${outputs.length}`}
              className="min-w-0 basis-full shrink-0 snap-start rounded-xl border border-border px-4 py-3 md:basis-[calc((100%_-_24px)/2)]"
            >
              <ResultSource output={output} workspaceId={workspaceId} />
              <OutputCard
                output={output}
                workspaceId={workspaceId}
                compact
                sessionId={
                  originSessionId ??
                  (sessions.some((session) => session.id === output.session_id)
                    ? output.session_id
                    : null)
                }
              />
              <time
                dateTime={output.created_at}
                className="text-xs text-muted-foreground"
              >
                {new Date(output.created_at).toLocaleString("zh-CN")}
              </time>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function ResultSource({
  output,
  workspaceId,
}: {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
}) {
  const session = useQuery({
    queryKey: sessionQueryKeys.detail(output.session_id ?? ""),
    queryFn: () => getSession(output.session_id!),
    enabled: output.session_id !== null,
  });
  if (output.session_id === null)
    return (
      <p className="text-xs text-muted-foreground">
        {content.sourceSession} · {output.source_session_title} ·{" "}
        {content.deletedSession}
      </p>
    );
  if (session.isPending)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {content.loadingSource}
      </p>
    );
  if (session.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        {content.sourceFailed}
      </p>
    );
  return (
    <p className="text-xs text-muted-foreground">
      {content.sourceSession} ·{" "}
      {session.data.archived ? (
        <span>
          {session.data.title} · {content.archivedSession}
        </span>
      ) : (
        <Link
          className="hover:text-foreground hover:underline"
          to={sessionAnalysisPath(workspaceId, session.data.id, "conversation")}
        >
          {session.data.title}
        </Link>
      )}
    </p>
  );
}
