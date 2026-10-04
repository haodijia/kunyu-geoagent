import { LoaderCircle } from "lucide-react";
import { ApiError } from "@/api/client";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.filePreview;
export function LoadingPreview() { return <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{content.loading}</div>; }
export function PreviewNotice({ text, danger = false }: { readonly text: string; readonly danger?: boolean }) { return <div className={`flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm ${danger ? "text-destructive" : "text-secondary-foreground"}`} role={danger ? "alert" : "status"}>{text}</div>; }
export function filePreviewError(error: unknown): string { return error instanceof ApiError && error.code !== null && error.code in content.errors ? content.errors[error.code as keyof typeof content.errors] : error instanceof Error ? error.message : content.failed; }

export function fileSaveError(error: unknown): string { return error instanceof ApiError && error.code === "FS_STALE_VERSION" ? content.saveConflict : filePreviewError(error); }
