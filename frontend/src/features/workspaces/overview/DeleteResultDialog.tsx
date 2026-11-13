import { requestJson } from "@/api/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  analysisKeys,
  workspaceResultsPath,
  type AnalysisOutput,
} from "@/features/analysis/api";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive } from "vue";
export const DeleteResultDialog = defineComponent(
  (
    componentProps: {
      readonly output: AnalysisOutput;
      readonly onClose: () => void;
    },
    { slots: _slots },
  ) => {
    const output = computed(() => componentProps.output),
      onClose = computed(() => componentProps.onClose);
    const client = useQueryClient();
    const count = computed(() => output.value.metadata.views.length);
    const remove = reactive(
      useMutation({
        mutationFn: () =>
          requestJson<{
            removed_output_ids: string[];
            affected_session_ids: string[];
          }>(
            `${workspaceResultsPath(output.value.workspace_id)}/${encodeURIComponent(output.value.id)}`,
            {
              method: "DELETE",
            },
          ),
        onSuccess: async (result) => {
          await Promise.all([
            client.invalidateQueries({
              queryKey: analysisKeys.outputs(output.value.workspace_id),
            }),
            client.invalidateQueries({
              queryKey: ["workspace-files", output.value.workspace_id],
            }),
            ...result.affected_session_ids.map((id) =>
              client.invalidateQueries({
                queryKey: analysisKeys.layers(id),
              }),
            ),
          ]);
          result.removed_output_ids.forEach((id) =>
            client.removeQueries({
              queryKey: analysisKeys.output(output.value.workspace_id, id),
            }),
          );
          onClose.value();
        },
        onError: (error) =>
          console.error("[overview] Result removal failed", error),
      }),
    );
    return () => {
      const _onClose = onClose.value,
        _output = output.value,
        _count = count.value;
      return (
        <AlertDialog
          open
          onUpdate:open={(open) => {
            if (!open && !remove.isPending) _onClose();
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>{copy.deleteResult}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy.deleteDescription(_output.title, _count)}
            </AlertDialogDescription>
            {remove.isError && (
              <p class="text-xs text-destructive" role="alert">
                {remove.error.message}
              </p>
            )}
            <div class="flex justify-end gap-2">
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
    };
  },
  {
    name: "DeleteResultDialog",
    inheritAttrs: false,
    props: ["output", "onClose"],
  },
);
