import { ApiError } from "@/api/client";
import { useAppUiStore } from "@/app/store";
import {
  uploadAttachments,
  type AttachmentUpload,
} from "@/features/attachments/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import {
  computed,
  shallowReactive,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
const content = zhCN.conversation.attachments;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const EMPTY_ATTACHMENTS = [] as const;
export function useComposerAttachments(sessionId: MaybeRefOrGetter<string>) {
  const attachments = computed(() =>
    ((state) =>
      state.composerAttachmentsBySession[toValue(sessionId)] ??
      EMPTY_ATTACHMENTS)(useAppUiStore()),
  );
  const setAttachments = computed(() =>
    ((state) => state.setComposerAttachments)(useAppUiStore()),
  );
  const busy = shallowRef(false);
  const controller = shallowRef<AbortController | null>(null);
  const retryBatch = shallowRef<readonly AttachmentUpload[] | null>(null);
  const pending = shallowRef(false),
    setPending = refSetter(pending);
  const error = shallowRef<string | null>(null),
    setError = refSetter(error);
  watchMounted([], () => () => controller.value?.abort());
  async function publish(
    items: readonly AttachmentUpload[],
    abort: AbortController,
  ) {
    retryBatch.value = items;
    try {
      const refs = await uploadAttachments(
        toValue(sessionId),
        items,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      const current =
        useAppUiStore().composerAttachmentsBySession[toValue(sessionId)] ??
        EMPTY_ATTACHMENTS;
      setAttachments.value(toValue(sessionId), [...current, ...refs]);
      retryBatch.value = null;
      setError(null);
    } catch (failure) {
      if (abort.signal.aborted) return;
      console.error("[attachments] Upload failed.", {
        sessionId: toValue(sessionId),
        error: failure,
      });
      const labels: Readonly<Record<string, string>> = content.errors;
      setError(
        failure instanceof ApiError &&
          failure.code !== null &&
          labels[failure.code] !== undefined
          ? labels[failure.code]!
          : content.uploadFailed,
      );
    } finally {
      if (!abort.signal.aborted) {
        busy.value = false;
        setPending(false);
      }
    }
  }
  async function addFiles(files: readonly File[]) {
    if (busy.value || retryBatch.value !== null || files.length === 0) return;
    const current =
      useAppUiStore().composerAttachmentsBySession[toValue(sessionId)] ??
      EMPTY_ATTACHMENTS;
    if (current.length + files.length > 8) {
      setError(content.tooMany);
      return;
    }
    if (
      files.some((file) => file.size > 16 * 1024 * 1024) ||
      current.reduce((sum, ref) => sum + ref.bytes, 0) +
        files.reduce((sum, file) => sum + file.size, 0) >
        32 * 1024 * 1024
    ) {
      setError(content.tooLarge);
      return;
    }
    busy.value = true;
    setPending(true);
    setError(null);
    const abort = new AbortController();
    controller.value = abort;
    try {
      const items = await Promise.all(
        files.map(async (file): Promise<AttachmentUpload> => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const parts: string[] = [];
          for (let offset = 0; offset < bytes.length; offset += 32_768)
            parts.push(
              String.fromCharCode(...bytes.subarray(offset, offset + 32_768)),
            );
          return {
            id: crypto.randomUUID(),
            name: file.name,
            kind: IMAGE_TYPES.has(file.type) ? "image" : "file",
            media_type: IMAGE_TYPES.has(file.type) ? file.type : null,
            data_base64: btoa(parts.join("")),
          };
        }),
      );
      if (!abort.signal.aborted) await publish(items, abort);
    } catch (failure) {
      if (abort.signal.aborted) return;
      console.error("[attachments] File read failed.", {
        sessionId: toValue(sessionId),
        error: failure,
      });
      setError(content.readFailed);
      busy.value = false;
      setPending(false);
    }
  }
  return shallowReactive({
    get attachments() {
      return attachments.value;
    },
    get pending() {
      return pending.value;
    },
    get error() {
      return error.value;
    },
    get blocked() {
      return () => busy.value || retryBatch.value !== null;
    },
    get addFiles() {
      return addFiles;
    },
    get remove() {
      return (id: string) => {
        if (!busy.value) {
          const current =
            useAppUiStore().composerAttachmentsBySession[toValue(sessionId)] ??
            EMPTY_ATTACHMENTS;
          setAttachments.value(
            toValue(sessionId),
            current.filter((ref) => ref.id !== id),
          );
        }
      };
    },
    get retry() {
      return () => {
        if (busy.value || retryBatch.value === null) return;
        const abort = new AbortController();
        controller.value = abort;
        busy.value = true;
        setPending(true);
        setError(null);
        void publish(retryBatch.value, abort);
      };
    },
    get dismissError() {
      return () => {
        if (!busy.value) {
          retryBatch.value = null;
          setError(null);
        }
      };
    },
    get retryAvailable() {
      return retryBatch.value !== null;
    },
  });
}
