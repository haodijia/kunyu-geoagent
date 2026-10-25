import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  analysisKeys,
  workspaceResultsPath,
  type AnalysisOutput,
} from "@/features/analysis/api";
import { productReferences } from "@/features/analysis/product-metadata";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";

export function DeleteResultDialog({
  output,
  onClose,
}: {
  readonly output: AnalysisOutput;
  readonly onClose: () => void;
}) {
  const client = useQueryClient();
  const count = Math.max(1, productReferences(output.metadata).length);
  const remove = useMutation({
    mutationFn: () =>
      requestJson<{
        removed_output_ids: string[];
        affected_session_ids: string[];
      }>(
        `${workspaceResultsPath(output.workspace_id)}/${encodeURIComponent(output.id)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: analysisKeys.outputs(output.workspace_id),
        }),
        client.invalidateQueries({
          queryKey: ["workspace-files", output.workspace_id],
        }),
        ...result.affected_session_ids.map((id) =>
          client.invalidateQueries({ queryKey: analysisKeys.layers(id) }),
        ),
      ]);
      result.removed_output_ids.forEach((id) =>
        client.removeQueries({
          queryKey: analysisKeys.output(output.workspace_id, id),
        }),
      );
      onClose();
    },
    onError: (error) =>
      console.error("[overview] Result removal failed", error),
  });
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle>{copy.deleteResult}</AlertDialogTitle>
        <AlertDialogDescription>
          {copy.deleteDescription(output.title, count)}
        </AlertDialogDescription>
        {remove.isError && (
          <p className="text-xs text-destructive" role="alert">
            {remove.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={remove.isPending}>
              {copy.cancel}
            </Button>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? copy.deleting : copy.confirmDelete}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
