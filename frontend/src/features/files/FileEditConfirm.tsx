import { useState } from "react";

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { fileSaveError } from "./preview-status";

export interface FileEditAction { readonly kind: "close" | "hide" | "refresh"; readonly ids: readonly string[]; }
interface Props {
  readonly action: FileEditAction | null; readonly count: number; readonly busy: boolean;
  onCancel(): void; onDiscard(): void; onSave(): Promise<void>;
}
const content = zhCN.filePreview;

export function FileEditConfirm({ action, count, busy, onCancel, onDiscard, onSave }: Props) {
  const [error, setError] = useState<string | null>(null);
  const refresh = action?.kind === "refresh";
  async function save() {
    setError(null);
    try { await onSave(); }
    catch (error) { console.error("[files] Save before closing failed.", error); setError(fileSaveError(error)); }
  }
  return <AlertDialog open={action !== null} onOpenChange={open => { if (!open && !busy) { setError(null); onCancel(); } }}>
    <AlertDialogContent>
      <AlertDialogTitle>{refresh ? content.refreshConfirmTitle : content.closeConfirmTitle}</AlertDialogTitle>
      <AlertDialogDescription>{refresh ? content.refreshConfirmMessage : content.closeConfirmMessage(count)}</AlertDialogDescription>
      {error !== null && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setError(null); onCancel(); }}>{content.cancel}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setError(null); onDiscard(); }}>{refresh ? content.discardAndRefresh : content.closeWithoutSave}</Button>
        {!refresh && <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? content.saving : content.saveAndClose}</Button>}
      </div>
    </AlertDialogContent>
  </AlertDialog>;
}
