import type { ReactNode } from "react";
import { toast } from "sonner";
import { zhCN } from "@/locales/zh-CN";
import { useFilePreview } from "./FilePreviewContext";
import { localFileLink } from "./file-path";

export function FileLink({ href, base, children }: { readonly href: string; readonly base: string; readonly children: ReactNode }) {
  const preview = useFilePreview();
  return <button type="button" className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80" onClick={() => {
    try { const link = localFileLink(href, base); if (link === null) throw new Error("Invalid local file link."); preview.openFile(link.path, link.line); }
    catch (error) { console.error("[files] Invalid file link.", { href, error }); toast.error(zhCN.filePreview.invalidLink); }
  }}>{children}</button>;
}
