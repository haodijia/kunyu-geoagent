import { analysisApi } from "@/features/analysis/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { useQuery } from "@tanstack/vue-query";
import {
  computed,
  reactive,
  shallowReactive,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
export function useLayerPreview(
  sessionId: MaybeRefOrGetter<string>,
  layerId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<any> = true,
  revision?: MaybeRefOrGetter<number>,
) {
  const query = reactive(
    useQuery(
      computed(() => ({
        queryKey: [
          "map-layer-preview",
          toValue(sessionId),
          toValue(layerId),
          toValue(revision),
        ],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          analysisApi.layerPreview(
            toValue(sessionId),
            toValue(layerId),
            signal,
          ),
        staleTime: Infinity,
        enabled: toValue(enabled),
      })),
    ),
  );
  const url = shallowRef<string | null>(null),
    setUrl = refSetter(url);
  watchMounted([() => query.data], () => {
    if (query.data === undefined) return;
    const value = URL.createObjectURL(query.data);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  });
  watchMounted([() => toValue(layerId), () => query.error], () => {
    if (query.error !== null)
      console.error("[map] Layer preview failed.", {
        layerId: toValue(layerId),
        error: query.error,
      });
  });
  return shallowReactive({
    get url() {
      return url.value;
    },
    get error() {
      return query.isError;
    },
  });
}
