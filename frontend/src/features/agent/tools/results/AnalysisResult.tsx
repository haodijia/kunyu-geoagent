import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import { useAnalysisOutputs } from "@/features/analysis/useAnalysis";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { jobById, jobError } from "@/features/jobs/job-state";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import { ImageLightbox } from "@/features/attachments/ImageLightbox";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { useState } from "react";

const content = zhCN.analysis;

export function AnalysisResult({ jobId }: {
  readonly jobId: string;
}) {
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const outputs = useAnalysisOutputs(session.workspace_id);
  if (outputs.isError)
    return <p role="alert" className="text-xs text-destructive">{content.loadFailed}</p>;
  if (outputs.isPending)
    return <p role="status" className="text-xs text-muted-foreground">{content.loading}</p>;
  const output = outputs.data.find(item => item.job_id === jobId);
  if (output !== undefined) return <AnalysisPreview key={output.id} output={output} />;
  const job = jobById(jobId, records);
  if (job === undefined)
    return <p role="status" className="text-xs text-muted-foreground">{content.loading}</p>;
  const status = job.status === "killed" ? "cancelled" : job.status === "stopping" ? "running" : job.status;
  const error = jobError(job);
  return <div className="space-y-1 text-xs" role="status">
    <p className="text-muted-foreground">{zhCN.conversation.tools.status[status]} · {zhCN.conversation.tools.jobStages[job.stage]}</p>
    {job.detail !== null && <p className="text-warning">{job.detail}</p>}
    {error !== null && <p role="alert" className="text-destructive">{error}</p>}
    {job.status === "completed" && <p className="text-muted-foreground">{content.loading}</p>}
  </div>;
}

function AnalysisPreview({ output }: { readonly output: AnalysisOutput }) {
  const image = useOutputImage(output.workspace_id, output.id);
  const [open, setOpen] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const description = output.kind === "scalar_raster" ? content.toolScalarDescription : content.toolRgbDescription;
  const metadata = output.metadata;
  function imageFailed() {
    console.error("[analysis] Tool preview decoding failed.", { outputId: output.id });
    setDecodeFailed(true);
    setOpen(false);
  }
  return <figure className="m-0 min-w-0 space-y-2" data-analysis-preview={output.id}>
    {image.error || decodeFailed ? <p role="alert" className="text-xs text-destructive">{content.previewFailed}</p>
      : image.url === null ? <p role="status" className="text-xs text-muted-foreground">{content.loading}</p>
      : <Button type="button" variant="ghost" className="h-auto w-full max-w-lg overflow-hidden rounded-md bg-muted p-0" aria-label={zhCN.conversation.attachments.preview(output.title)} onClick={() => setOpen(true)}>
        <img src={image.url} alt={output.title} className="max-h-64 w-full object-contain" onError={imageFailed} />
      </Button>}
    <figcaption className="space-y-1 text-xs leading-5 text-muted-foreground">
      <p className="font-medium text-foreground">{output.title}</p>
      <p>{description}</p>
      <div className="flex flex-wrap gap-x-3">
        {typeof metadata.width === "number" && typeof metadata.height === "number" && <span>{content.toolRasterSize(metadata.width, metadata.height)}</span>}
        {typeof metadata.crs === "string" && <span>{content.spatialReference}：{metadata.crs}</span>}
        {Array.isArray(metadata.display_range) && metadata.display_range.length === 2 && <span>{content.toolDisplayRange(Number(metadata.display_range[0]), Number(metadata.display_range[1]))}</span>}
      </div>
    </figcaption>
    {open && image.url !== null && <ImageLightbox src={image.url} name={output.title} description={description} onClose={() => setOpen(false)} onError={imageFailed} />}
  </figure>;
}
