import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/client";
import { useAppUiStore } from "@/app/store";
import { zhCN } from "@/locales/zh-CN";
import { uploadAttachments, type AttachmentUpload } from "./api";

const content = zhCN.conversation.attachments;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const EMPTY_ATTACHMENTS = [] as const;

export function useComposerAttachments(sessionId: string) {
  const attachments = useAppUiStore((state) => state.composerAttachmentsBySession[sessionId] ?? EMPTY_ATTACHMENTS);
  const setAttachments = useAppUiStore((state) => state.setComposerAttachments);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const retryBatch = useRef<readonly AttachmentUpload[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function publish(items: readonly AttachmentUpload[], abort: AbortController) {
    retryBatch.current = items;
    try {
      const refs = await uploadAttachments(sessionId, items, abort.signal);
      if (abort.signal.aborted) return;
      const current = useAppUiStore.getState().composerAttachmentsBySession[sessionId] ?? EMPTY_ATTACHMENTS;
      setAttachments(sessionId, [...current, ...refs]);
      retryBatch.current = null;
      setError(null);
    } catch (failure) {
      if (abort.signal.aborted) return;
      console.error("[attachments] Upload failed.", { sessionId, error: failure });
      const labels: Readonly<Record<string, string>> = content.errors;
      setError(failure instanceof ApiError && failure.code !== null && labels[failure.code] !== undefined ? labels[failure.code]! : content.uploadFailed);
    } finally {
      if (!abort.signal.aborted) { busy.current = false; setPending(false); }
    }
  }

  async function addFiles(files: readonly File[]) {
    if (busy.current || retryBatch.current !== null || files.length === 0) return;
    const current = useAppUiStore.getState().composerAttachmentsBySession[sessionId] ?? EMPTY_ATTACHMENTS;
    if (current.length + files.length > 8) { setError(content.tooMany); return; }
    if (files.some((file) => file.size > 16 * 1024 * 1024) || current.reduce((sum, ref) => sum + ref.bytes, 0) + files.reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024) { setError(content.tooLarge); return; }
    busy.current = true;
    setPending(true);
    setError(null);
    const abort = new AbortController(); controller.current = abort;
    try {
      const items = await Promise.all(files.map(async (file): Promise<AttachmentUpload> => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const parts: string[] = [];
        for (let offset = 0; offset < bytes.length; offset += 32_768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
        return { id: crypto.randomUUID(), name: file.name, kind: IMAGE_TYPES.has(file.type) ? "image" : "file", media_type: IMAGE_TYPES.has(file.type) ? file.type : null, data_base64: btoa(parts.join("")) };
      }));
      if (!abort.signal.aborted) await publish(items, abort);
    } catch (failure) {
      if (abort.signal.aborted) return;
      console.error("[attachments] File read failed.", { sessionId, error: failure });
      setError(content.readFailed); busy.current = false; setPending(false);
    }
  }

  return {
    attachments, pending, error,
    blocked: () => busy.current || retryBatch.current !== null,
    addFiles,
    remove: (id: string) => { if (!busy.current) { const current = useAppUiStore.getState().composerAttachmentsBySession[sessionId] ?? EMPTY_ATTACHMENTS; setAttachments(sessionId, current.filter((ref) => ref.id !== id)); } },
    retry: () => {
      if (busy.current || retryBatch.current === null) return;
      const abort = new AbortController(); controller.current = abort;
      busy.current = true; setPending(true); setError(null);
      void publish(retryBatch.current, abort);
    },
    dismissError: () => { if (!busy.current) { retryBatch.current = null; setError(null); } },
    retryAvailable: retryBatch.current !== null,
  };
}
