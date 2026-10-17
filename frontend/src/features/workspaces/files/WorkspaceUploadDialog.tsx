import { Button } from "@/components/ui/button";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import type { Workspace } from "@/features/workspaces/api";
import {
  uploadWorkspaceFile,
  type WorkspaceFile,
} from "@/features/workspaces/files/files-api";
import { zhCN } from "@/locales/zh-CN";
import { Check, FileText, Image, Upload, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const text = zhCN.workspaceFiles;
type UploadItem = {
  readonly id: string;
  readonly file: File;
  readonly status: "queued" | "uploading" | "completed" | "failed" | "cancelled";
  readonly receipt: WorkspaceFile | null;
  readonly error: string | null;
};

export function WorkspaceUploadDialog({ workspace, onClose }: { readonly workspace: Workspace; readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const titleId = useId();
  const [items, setItems] = useState<readonly UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => () => controller.current?.abort(), []);

  function update(id: string, changes: Partial<UploadItem>) {
    setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  }

  async function upload(files: readonly File[]) {
    if (controller.current !== null || files.length === 0) return;
    const next: UploadItem[] = files.map(file => ({ id: crypto.randomUUID(), file, status: "queued", receipt: null, error: null }));
    const abort = new AbortController();
    controller.current = abort;
    setItems(current => [...current, ...next]);
    setBusy(true);
    try {
      for (const item of next) {
        if (abort.signal.aborted) {
          update(item.id, { status: "cancelled" });
          continue;
        }
        update(item.id, { status: "uploading" });
        try {
          const receipt = await uploadWorkspaceFile(workspace.id, item.file, abort.signal);
          update(item.id, { status: "completed", receipt });
        } catch (error) {
          if (abort.signal.aborted) update(item.id, { status: "cancelled" });
          else {
            console.error("[workspaces] File upload failed", error);
            update(item.id, { status: "failed", error: error instanceof Error ? error.message : text.uploadFailed });
          }
        }
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  function close() {
    controller.current?.abort();
    onClose();
  }

  const finished = items.filter(item => item.status !== "queued" && item.status !== "uploading").length;
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()}
      onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}
      className="m-auto w-[min(560px,calc(100%_-_32px))] max-h-[80dvh] rounded-[16px] border border-border bg-popover p-0 text-foreground shadow-xl backdrop:bg-black/30">
      <div className="flex max-h-[80dvh] flex-col">
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[15px] font-medium">{text.title}</h2>
            <p className="m-0 mt-1 truncate text-xs text-muted-foreground">{workspace.name}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={text.close} onClick={close}><X className="size-4" /></Button>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <p className="m-0 text-[13px] leading-5 text-muted-foreground">{text.description}</p>
          <input ref={picker} type="file" multiple className="hidden" aria-label={text.choose}
            onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void upload(files); }} />
          <button type="button" disabled={busy} onClick={() => picker.current?.click()}
            onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!busy) void upload(Array.from(event.dataTransfer.files)); }}
            className="mt-4 flex w-full cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed border-border bg-muted/30 px-4 py-6 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-50">
            <Upload className="size-5" aria-hidden="true" /><span>{text.chooseOrDrop}</span><span className="text-xs">{text.limit}</span>
          </button>
          {items.length > 0 && <div className="mt-4 space-y-2" aria-live="polite">
            {busy && <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{text.uploading}</span><span>{finished} / {items.length}</span></div>
              <div className="h-[3px] overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${finished / items.length * 100}%` }} /></div>
            </div>}
            {items.map(item => <div key={item.id} className="flex items-start gap-3 rounded-[8px] border border-border px-3 py-2.5">
              {item.file.type.startsWith("image/") ? <Image className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]" title={item.file.name}>{item.receipt === null ? item.file.name : item.receipt.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{text.status[item.status]}</div>
                {item.receipt !== null && <code className="mt-1 block break-all text-xs text-muted-foreground">{item.receipt.file_path}</code>}
                {item.error !== null && <p className="m-0 mt-1 text-xs leading-4 text-destructive" role="alert">{item.error}</p>}
              </div>
              {item.receipt !== null && <><Check className="mt-1 size-4 shrink-0 text-success" aria-label={text.saved} /><CopyButton text={item.receipt.file_path} /></>}
            </div>)}
          </div>}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          {busy && <Button type="button" variant="outline" size="sm" onClick={() => controller.current?.abort()}>{text.cancelUploads}</Button>}
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={close}>{text.done}</Button>
        </footer>
      </div>
    </dialog>
  );
}
