import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analysisKeys, type AnalysisOutput } from "@/features/analysis/api";
import {
  assessmentApi,
  assessmentKeys,
  type StudyArea,
} from "@/features/assessments/api";
import { assessmentCopy as copy } from "@/locales/zh-CN/assessments";

export const selectClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs";

export function AssessmentForm({
  workspaceId,
  area,
  outputs,
}: {
  readonly workspaceId: string;
  readonly area: StudyArea | null;
  readonly outputs: readonly AnalysisOutput[];
}) {
  const [operation, setOperation] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof assessmentApi.create>[1]) =>
      assessmentApi.create(workspaceId, body),
    onError: (error) => console.error("[assessment] Create failed", error),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({
          queryKey: assessmentKeys.list(workspaceId),
        }),
        client.invalidateQueries({
          queryKey: analysisKeys.outputs(workspaceId),
        }),
      ]),
  });
  const scalar = outputs.filter((output) => output.kind === "scalar_raster");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (area === null) return;
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      operation_id: operation,
      title: String(data.get("title")),
      area_revision: area.revision,
      before_output_id: String(data.get("before_output_id")),
      after_output_id: String(data.get("after_output_id")),
      before_scl_output_id: String(data.get("before_scl_output_id")),
      after_scl_output_id: String(data.get("after_scl_output_id")),
      before_date: String(data.get("before_date")),
      after_date: String(data.get("after_date")),
      threshold: Number(data.get("threshold")),
      min_patch_area_m2: Number(data.get("min_patch_area_m2")),
      calibration: String(data.get("calibration")),
      event_context: String(data.get("event_context")),
      method_status:
        data.get("method_status") === "calibrated"
          ? "calibrated"
          : "exploratory",
    });
  }
  return (
    <form
      onSubmit={submit}
      onChange={() => {
        setOperation(crypto.randomUUID());
        mutation.reset();
      }}
      className="space-y-3 border-t border-border pt-3"
    >
      <p className="text-xs leading-5 text-muted-foreground">{copy.formHint}</p>
      <fieldset disabled={mutation.isPending} className="space-y-2">
        <label className="block space-y-1 text-xs">
          {copy.title}
          <Input name="title" required maxLength={120} />
        </label>
        {(
          [
            ["before_output_id", copy.before],
            ["after_output_id", copy.after],
            ["before_scl_output_id", copy.beforeScl],
            ["after_scl_output_id", copy.afterScl],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="block space-y-1 text-xs">
            {label}
            <select
              name={name}
              required
              defaultValue=""
              className={selectClass}
            >
              <option value="" disabled>
                {copy.select}
              </option>
              {scalar
                .filter(
                  (output) =>
                    name.includes("scl") ||
                    output.metadata.display_kind !== "classified",
                )
                .map((output) => (
                  <option key={output.id} value={output.id}>
                    {output.title}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["before_date", copy.beforeDate],
              ["after_date", copy.afterDate],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="min-w-0 space-y-1 text-xs">
              {label}
              <Input type="date" name={name} required />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs">
            {copy.threshold}
            <Input
              type="number"
              step="any"
              min={-1}
              max={1}
              name="threshold"
              required
            />
          </label>
          <label className="space-y-1 text-xs">
            {copy.minPatch}
            <Input
              type="number"
              step="any"
              min={0}
              max={1000000}
              name="min_patch_area_m2"
              required
            />
          </label>
        </div>
        <label className="block space-y-1 text-xs">
          {copy.method}
          <select name="method_status" className={selectClass}>
            <option value="exploratory">{copy.exploratory}</option>
            <option value="calibrated">{copy.calibrated}</option>
          </select>
        </label>
        <label className="block space-y-1 text-xs">
          {copy.calibration}
          <Textarea name="calibration" required maxLength={4000} />
        </label>
        <label className="block space-y-1 text-xs">
          {copy.event}
          <Textarea name="event_context" required maxLength={4000} />
        </label>
        <Button type="submit" size="sm" disabled={area === null}>
          {mutation.isPending ? copy.building : copy.create}
        </Button>
      </fieldset>
      {mutation.isError && (
        <p role="alert" className="text-xs text-destructive">
          {mutation.error.message}
        </p>
      )}
      {mutation.data !== undefined && (
        <p role="status" className="text-xs">
          {mutation.data.status === "succeeded"
            ? copy.succeeded
            : (mutation.data.error ?? copy.building)}
        </p>
      )}
    </form>
  );
}
