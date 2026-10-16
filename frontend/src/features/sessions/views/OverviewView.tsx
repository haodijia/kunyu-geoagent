import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { analysisApi, analysisKeys, type AnalysisOutput } from "@/features/analysis/api";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.overview;

export function OverviewView() {
  const session = useSessionWorkspace();
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(session.id),
    queryFn: () => analysisApi.outputs(session.id),
  });

  return (
    <main className="h-full overflow-y-auto px-6 py-8 md:px-10" aria-label={content.results}>
      {outputs.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">{content.loading}</p>
      ) : outputs.isError ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
          {content.loadFailed}
          <Button variant="ghost" size="sm" onClick={() => void outputs.refetch()}>{content.retry}</Button>
        </div>
      ) : outputs.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{content.emptyResults}</p>
      ) : (
        <div className={`mx-auto grid max-w-6xl gap-8 ${outputs.data.length > 1 ? "md:grid-cols-2" : ""}`}>
          {outputs.data.map((output) => <ResultImage key={output.id} output={output} />)}
        </div>
      )}
    </main>
  );
}

function ResultImage({ output }: { readonly output: AnalysisOutput }) {
  const image = useOutputImage(output.session_id, output.id);

  return (
    <figure className="flex min-w-0 items-center justify-center" data-analysis-output={output.id}>
      {image.url !== null ? (
        <img src={image.url} alt={output.title} title={output.title} className="max-h-[75vh] w-full object-contain" />
      ) : (
        <p role={image.error ? "alert" : "status"} className={`py-12 text-sm ${image.error ? "text-destructive" : "text-muted-foreground"}`}>
          {image.error ? zhCN.analysis.previewFailed : content.loading}
        </p>
      )}
    </figure>
  );
}
