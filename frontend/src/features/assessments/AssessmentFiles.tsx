import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  assessmentApi,
  assessmentKeys,
  type Assessment,
} from "@/features/assessments/api";
import { assessmentCopy as copy } from "@/locales/zh-CN/assessments";

export function AssessmentDownloads({ value }: { readonly value: Assessment }) {
  const download = useMutation({
    mutationFn: (filename: string) =>
      assessmentApi.download(value.workspace_id, value.id, filename),
    onError: (error) => console.error("[assessment] Download failed", error),
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.artifacts.map((item) => (
          <Button
            key={item.filename}
            variant="outline"
            size="sm"
            disabled={download.isPending}
            onClick={() => download.mutate(item.filename)}
          >
            <Download className="size-3" />
            {item.label}
          </Button>
        ))}
      </div>
      {download.isError && (
        <p role="alert" className="text-xs text-destructive">
          {download.error.message}
        </p>
      )}
    </div>
  );
}

export function AssessmentFiles({
  workspaceId,
  assessmentId,
}: {
  readonly workspaceId: string;
  readonly assessmentId: string;
}) {
  const query = useQuery({
    queryKey: assessmentKeys.detail(workspaceId, assessmentId),
    queryFn: () => assessmentApi.get(workspaceId, assessmentId),
  });
  if (query.isPending)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {copy.building}
      </p>
    );
  if (query.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        {query.error.message}
      </p>
    );
  return <AssessmentDownloads value={query.data} />;
}
