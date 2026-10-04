import { useCallback, useEffect, useRef, useState } from "react";

import { zhCN } from "@/locales/zh-CN";
import { saveFile, type FilePreview } from "./api";
import { workspaceFilePath } from "./file-path";
import { fileSaveError } from "./preview-status";

export interface FileDraft { readonly text: string; readonly original: string; readonly version: string; readonly kind: "code" | "markdown" | "html"; }
type Drafts = Readonly<Partial<Record<string, FileDraft>>>;

function readDrafts(key: string): Drafts {
  const stored = sessionStorage.getItem(key);
  if (stored === null) return {};
  const drafts: unknown = JSON.parse(stored);
  if (typeof drafts !== "object" || drafts === null || Array.isArray(drafts)) throw new Error("Invalid file drafts.");
  for (const [path, item] of Object.entries(drafts)) {
    const draft = item as FileDraft;
    if (!path.startsWith("/workspace/") || workspaceFilePath(path) !== path || typeof draft !== "object" || draft === null
      || typeof draft.text !== "string" || typeof draft.original !== "string" || draft.text === draft.original
      || typeof draft.version !== "string" || !draft.version || !["code", "markdown", "html"].includes(draft.kind)) throw new Error("Invalid persisted file draft.");
  }
  return drafts as Drafts;
}

export function useFileDrafts(sessionId: string) {
  const key = `kunyu:file-drafts:${sessionId}`;
  const [drafts, setDrafts] = useState(() => readDrafts(key));
  const current = useRef(drafts); current.current = drafts;
  const [saving, setSaving] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [storageError, setStorageError] = useState<string | null>(null);
  const pending = useRef(new Map<string, { readonly controller: AbortController; readonly result: Promise<FilePreview> }>());
  const persist = useCallback(() => {
    try { sessionStorage.setItem(key, JSON.stringify(current.current)); setStorageError(null); }
    catch (error) { console.error("[files] Draft persistence failed.", { sessionId, error }); setStorageError(zhCN.filePreview.draftStorageFailed); }
  }, [key, sessionId]);
  useEffect(persist, [drafts, persist]);
  useEffect(() => {
    const abort = () => { persist(); for (const operation of pending.current.values()) operation.controller.abort(); };
    window.addEventListener("beforeunload", abort);
    return () => { window.removeEventListener("beforeunload", abort); abort(); };
  }, [persist]);
  const discard = useCallback((path: string) => {
    if (pending.current.has(path)) throw new Error("Cannot discard a file while saving it.");
    setDrafts(current => { const next = { ...current }; delete next[path]; return next; });
    setErrors(current => { const next = { ...current }; delete next[path]; return next; });
  }, []);
  const edit = useCallback((path: string, text: string, base: FilePreview | undefined) => {
    if (pending.current.has(path)) throw new Error("Cannot edit a file while saving it.");
    if (!path.startsWith("/workspace/")) throw new Error("This preview cannot be edited.");
    setDrafts(current => {
      const existing = current[path];
      let draft: FileDraft;
      if (existing !== undefined) draft = { ...existing, text };
      else {
        if (base === undefined || !base.editable || base.state !== "ready" || base.text === null || !(base.kind === "code" || base.kind === "markdown" || base.kind === "html")) throw new Error("This preview cannot be edited.");
        draft = { original: base.text, version: base.version, kind: base.kind, text };
      }
      const next = { ...current };
      if (text === draft.original) delete next[path]; else next[path] = draft;
      return next;
    });
  }, []);
  const save = useCallback((path: string): Promise<FilePreview> => {
    const operation = pending.current.get(path);
    if (operation !== undefined) return operation.result;
    const draft = current.current[path];
    if (draft === undefined) throw new Error("The file has no unsaved changes.");
    const controller = new AbortController();
    setSaving(current => [...current, path]);
    setErrors(current => { const next = { ...current }; delete next[path]; return next; });
    const result = saveFile(sessionId, path, draft.text, draft.version, controller.signal).then(preview => {
      setDrafts(current => { const next = { ...current }; delete next[path]; return next; });
      return preview;
    }).catch(error => {
      if (!controller.signal.aborted) {
        console.error("[files] Save failed.", { sessionId, path, error });
        setErrors(current => ({ ...current, [path]: fileSaveError(error) }));
      }
      throw error;
    }).finally(() => { pending.current.delete(path); setSaving(current => current.filter(item => item !== path)); });
    pending.current.set(path, { controller, result });
    return result;
  }, [sessionId]);
  return { drafts, saving, errors, storageError, edit, discard, save };
}
