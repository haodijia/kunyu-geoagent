import { analysisApi } from "@/features/analysis/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import {
  shallowReactive,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
export function useOutputImage(
  workspaceId: MaybeRefOrGetter<string>,
  outputId: MaybeRefOrGetter<string>,
  viewId?: MaybeRefOrGetter<string>,
  revision?: MaybeRefOrGetter<number>,
) {
  const url = shallowRef<string | null>(null),
    setUrl = refSetter(url);
  const error = shallowRef(false),
    setError = refSetter(error);
  watchMounted(
    [
      () => toValue(workspaceId),
      () => toValue(outputId),
      () => toValue(viewId),
      () => toValue(revision),
    ],
    () => {
      let active = true;
      let objectUrl: string | null = null;
      setUrl(null);
      setError(false);
      void analysisApi
        .preview(toValue(workspaceId), toValue(outputId), toValue(viewId))
        .then((blob) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        })
        .catch((reason) => {
          if (!active) return;
          console.error("[analysis] Result preview failed.", {
            outputId: toValue(outputId),
            reason,
          });
          setError(true);
        });
      return () => {
        active = false;
        if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
      };
    },
  );
  return shallowReactive({
    get url() {
      return url.value;
    },
    get error() {
      return error.value;
    },
  });
}
