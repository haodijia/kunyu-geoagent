import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput } from "@/features/analysis/api";
import {
  assessmentApi,
  assessmentKeys,
  type Assessment,
  type StudyArea,
} from "@/features/assessments/api";
import { AssessmentDownloads } from "@/features/assessments/AssessmentFiles";
import { AssessmentForm } from "@/features/assessments/AssessmentForm";
import { assessmentCopy as copy } from "@/locales/zh-CN/assessments";

export function AssessmentRecords({
  workspaceId,
  area,
  outputs,
  active,
  candidateId,
  onCandidates,
}: {
  readonly workspaceId: string;
  readonly area: StudyArea | null;
  readonly outputs: readonly AnalysisOutput[];
  readonly active: boolean;
  readonly candidateId: string | null;
  readonly onCandidates: (value: Assessment) => void;
}) {
  const query = useQuery({
    queryKey: assessmentKeys.list(workspaceId),
    queryFn: () => assessmentApi.list(workspaceId),
    refetchInterval: active ? 5000 : false,
  });
  return (
    <div className="space-y-3">
      {query.isError && (
        <p role="alert" className="text-xs text-destructive">
          {query.error.message}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
          >
            {copy.refresh}
          </Button>
        </p>
      )}
      {query.data?.length === 0 && (
        <p className="text-xs text-muted-foreground">{copy.empty}</p>
      )}
      {query.data?.map((value) => (
        <section
          key={value.id}
          className="space-y-2 border-b border-border pb-3"
        >
          <p className="text-sm font-medium">{value.request.title}</p>
          <p className="text-xs text-muted-foreground">
            {value.request.before_date} → {value.request.after_date} ·{" "}
            {copy[value.status]}
          </p>
          {value.status === "succeeded" && (
            <>
              <p className="text-xs">
                {copy.coverage}:{" "}
                {(Number(value.metrics.common_valid_fraction) * 100).toFixed(2)}
                % · {copy.added}:{" "}
                {(Number(value.metrics.raw_added_water_area_m2) / 1e6).toFixed(
                  4,
                )}{" "}
                km²
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {copy.classHint}
              </p>
              <AssessmentDownloads value={value} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => onCandidates(value)}
              >
                {candidateId === value.id
                  ? copy.hideCandidates
                  : copy.showCandidates}
              </Button>
            </>
          )}
          {value.error !== null && (
            <p className="text-xs text-destructive">{value.error}</p>
          )}
        </section>
      ))}
      <AssessmentForm workspaceId={workspaceId} area={area} outputs={outputs} />
    </div>
  );
}
