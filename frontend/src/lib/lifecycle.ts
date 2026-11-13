import {
  onBeforeUnmount,
  onMounted,
  watch,
  type ShallowRef,
  type WatchSource,
  type WatchStopHandle,
} from "vue";

/** Watch explicit dependencies after DOM refs are mounted and dispose on unmount. */
export function watchMounted(
  sources: WatchSource[],
  effect: () => void | (() => void),
) {
  let stop: WatchStopHandle | undefined;
  onMounted(() => {
    stop = watch(
      sources,
      (_next, _previous, onCleanup) => {
        const cleanup = effect();
        if (cleanup) onCleanup(cleanup);
      },
      {
        immediate: true,
        flush: "post",
      },
    );
  });
  onBeforeUnmount(() => stop?.());
}
export function refSetter<T>(state: ShallowRef<T>) {
  return (next: T | ((current: T) => T)): void => {
    state.value =
      typeof next === "function"
        ? (next as (current: T) => T)(state.value)
        : next;
  };
}
