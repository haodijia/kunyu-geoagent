import { analysisKeys, type MapState } from "@/features/analysis/api";
import {
  imageryApi,
  type ImageCandidates,
} from "@/features/maps/imagery/imagery-api";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export function useImagerySelection(
  state: MapState,
  candidates: ImageCandidates | undefined,
) {
  const client = useQueryClient();
  const { draft, changeDraft, requestFrozen } = useSessionMessages();
  const [preview, setPreview] = useState(state.selected_image_id);
  useEffect(() => {
    setPreview(state.selected_image_id);
  }, [state.candidate_set_id, state.selected_image_id]);
  const selection = useMutation({
    mutationFn: (id: number) => {
      if (candidates === undefined)
        throw new Error("Candidates are not loaded.");
      return imageryApi.choose(state.session_id, candidates.id, id);
    },
    onSuccess: (value) => {
      client.setQueryData<MapState>(
        analysisKeys.map(state.session_id),
        (current) =>
          current === undefined || current.revision < value.revision
            ? value
            : current,
      );
      if (draft.trim() === "")
        changeDraft(zhCN.mapConversation.selectionPrompt);
    },
    onError: (error) => {
      console.error("[map] Image selection failed.", error);
      void client.invalidateQueries({
        queryKey: analysisKeys.map(state.session_id),
      });
    },
  });
  const { mutate, isPending } = selection;
  const select = useCallback(
    (id: number) => {
      if (requestFrozen || isPending) return;
      setPreview(id);
      if (id !== state.selected_image_id) mutate(id);
    },
    [requestFrozen, isPending, state.selected_image_id, mutate],
  );
  return {
    preview,
    select,
    disabled: requestFrozen || isPending,
    error: selection.isError ? selection.error.message : null,
  };
}
