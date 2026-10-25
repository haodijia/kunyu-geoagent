import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAppUiStore } from "@/app/store";
import type { AnalysisOutput } from "./api";
import { referenceOutput } from "./result-reference";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import { productCopy as copy } from "@/locales/zh-CN/product";

export function ResultSummary({
  output,
  sessionId,
}: {
  readonly output: AnalysisOutput;
  readonly sessionId: string | null;
}) {
  const navigate = useNavigate();
  const parameters = output.source_metadata.parameters;
  const limitations =
    typeof parameters === "object" &&
    parameters !== null &&
    "limitations" in parameters &&
    typeof parameters.limitations === "string"
      ? parameters.limitations
      : null;
  const origin = output.source_metadata.origin;
  const toolId =
    typeof origin === "object" &&
    origin !== null &&
    "tool_call_id" in origin &&
    typeof origin.tool_call_id === "string"
      ? origin.tool_call_id
      : null;
  const traceQuery =
    toolId === null ? "" : `?tool=${encodeURIComponent(toolId)}`;
  function prepareReport() {
    if (sessionId === null) return;
    referenceOutput(sessionId, output);
    const store = useAppUiStore.getState();
    store.setComposerDraft(
      sessionId,
      `${store.composerDraftBySession[sessionId]}\n${copy.reportPrompt}`,
    );
    void navigate(
      sessionAnalysisPath(output.workspace_id, sessionId, "conversation"),
    );
  }
  return (
    <section className="space-y-3 rounded-xl bg-muted/50 p-4 text-xs">
      <h3 className="text-sm font-medium">{copy.summary}</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 leading-5">
        <dt className="text-muted-foreground">{copy.generated}</dt>
        <dd>{new Date(output.created_at).toLocaleString("zh-CN")}</dd>
        <dt className="text-muted-foreground">{copy.sourceSession}</dt>
        <dd>{output.source_session_title}</dd>
        <dt className="text-muted-foreground">{copy.bounds}</dt>
        <dd className="break-words tabular-nums">
          {output.bounds.map((v) => v.toFixed(4)).join(" · ")}
        </dd>
      </dl>
      {limitations && (
        <p className="rounded-lg border border-warning/20 bg-warning/5 p-3 leading-5">
          {limitations}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {output.session_id !== null && (
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`${sessionAnalysisPath(output.workspace_id, output.session_id, "trace")}${traceQuery}`}
            >
              {copy.evidence}
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={sessionId === null}
          onClick={prepareReport}
        >
          {copy.reportDraft}
        </Button>
      </div>
    </section>
  );
}
