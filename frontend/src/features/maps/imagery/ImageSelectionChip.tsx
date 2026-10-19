import { analysisApi, analysisKeys, type MapState } from "@/features/analysis/api";
import { useMapState } from "@/features/maps/runtime/usePersistentMap";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

export function ImageSelectionChip({
  sessionId,
}: {
  readonly sessionId: string;
}) {
  const query = useMapState(sessionId);
  const state = query.data;
  const client = useQueryClient();
  const { requestFrozen } = useSessionMessages();
  const clear = useMutation({
    mutationFn: () => {
      return analysisApi.clearSelection(sessionId);
    },
    onSuccess: (value) =>
      client.setQueryData<MapState>(analysisKeys.map(sessionId), (current) =>
        current === undefined || current.revision < value.revision
          ? value
          : current,
      ),
    onError: (error) => {
      console.error("[map] Clearing image selection failed.", error);
      void client.invalidateQueries({
        queryKey: analysisKeys.map(sessionId),
      });
    },
  });
  if (state === undefined || state.image_selection === null) return null;
  return (
    <div className="mx-auto mb-2 w-[calc(100%-3rem)] max-w-[880px] text-xs">
      <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/95 px-3 py-1 text-primary">
        {zhCN.mapConversation.selectedImage(state.image_selection.image_id)}
        <button
          type="button"
          aria-label={zhCN.mapConversation.clearSelection}
          disabled={clear.isPending || requestFrozen}
          onClick={() => clear.mutate()}
        >
          <X className="size-3" />
        </button>
      </span>
      {clear.isError && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {clear.error.message}
        </p>
      )}
    </div>
  );
}
