import { useAppUiStore } from "@/app/store";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { watchMounted } from "@/lib/lifecycle";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
/** Consume a local focus request once the map exists, including after navigation. */
export function useMapFocus(
  sessionId: MaybeRefOrGetter<string>,
  map: MaybeRefOrGetter<ReturnType<typeof useSessionMap>>,
) {
  const bounds = computed(() =>
    ((state) => state.mapFocusBySession[toValue(sessionId)])(useAppUiStore()),
  );
  watchMounted(
    [() => toValue(sessionId), () => toValue(map), () => bounds.value],
    () => {
      if (!toValue(map).ready || bounds.value === undefined) return;
      toValue(map).focusBounds([
        [bounds.value[0], bounds.value[1]],
        [bounds.value[2], bounds.value[3]],
      ]);
      useAppUiStore().clearMapFocus(toValue(sessionId));
    },
  );
}
