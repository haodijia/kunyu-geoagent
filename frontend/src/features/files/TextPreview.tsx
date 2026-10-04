import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { zhCN } from "@/locales/zh-CN";
import type { FilePreview } from "./api";
import { formatFileBytes } from "./file-path";
import { useFilePreview, type PreviewTab } from "./FilePreviewContext";
import { HtmlPreview } from "./HtmlPreview";
import { filePreviewError, LoadingPreview } from "./preview-status";
import { elementScrollTarget, scrollPercent, usePreviewScrollSync } from "./usePreviewScrollSync";
import { usePreviewSplit } from "./usePreviewSplit";

const SourceEditor = lazy(() => import("./SourceEditor"));
const content = zhCN.filePreview;
interface Props {
  readonly tab: Extract<PreviewTab, { kind: "file" }>;
  readonly text: string; readonly kind: "code" | "markdown" | "html";
  readonly base: FilePreview | undefined; readonly error: unknown;
}

export function TextPreview({ tab, text, kind, base, error }: Props) {
  const editor = useFilePreview();
  const [mode, setMode] = useState<"source" | "preview">(tab.line === undefined ? "preview" : "source");
  const rendered = kind === "markdown" || kind === "html";
  const split = rendered && editor.split;
  const { setSplit } = editor;
  const sizing = usePreviewSplit();
  const sync = usePreviewScrollSync(split);
  const markdownRef = useCallback((element: HTMLDivElement | null) => sync.previewTarget(element === null ? null : elementScrollTarget(element)), [sync.previewTarget]);
  useEffect(() => { if (tab.line !== undefined) { setMode("source"); setSplit(false); } }, [tab, setSplit]);
  const editable = editor.drafts[tab.path] !== undefined || base?.editable === true;
  const saving = editor.saving.includes(tab.path);
  const bytes = new TextEncoder().encode(text).length;
  return <>
    {error !== null && <div role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">{filePreviewError(error)}</div>}
    {editor.saveErrors[tab.path] !== undefined && <div role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">{editor.saveErrors[tab.path]}</div>}
    {sizing.error !== null && <div role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">{sizing.error}</div>}
    {rendered && <div className="flex h-8 shrink-0 items-center gap-0 border-b border-border bg-muted/50 px-2 text-xs" role="toolbar" aria-label={content.viewMode}>
      {(["source", "preview"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} className={`h-full border-b-2 px-2.5 ${mode === value ? "border-primary bg-primary/10 text-primary" : "border-transparent text-secondary-foreground hover:bg-muted"}`} onClick={() => { setMode(value); setSplit(false); }}>{content[value]}</button>)}
      <Button size="sm" variant="ghost" className="ml-2 h-6 text-xs" aria-pressed={split} onClick={() => setSplit(!split)}>{content.split}</Button>
    </div>}
    <div className={`relative flex min-h-0 min-w-0 flex-1 overflow-hidden ${sizing.dragging ? "select-none [&_iframe]:pointer-events-none" : ""}`} data-preview-split={split} data-preview-resizing={sizing.dragging}>
      {(split || !rendered || mode === "source") && <div className="relative flex min-h-0 min-w-0 flex-col" style={{ width: split ? `${sizing.ratio}%` : "100%" }} data-preview-editor-pane>
        {split && <div className="flex h-10 shrink-0 items-center bg-muted/50 px-3 text-xs text-secondary-foreground">{content.editor}</div>}
        <Suspense fallback={<LoadingPreview />}><SourceEditor text={text} path={tab.path} line={tab.line} readOnly={!editable || saving} onChange={value => editor.edit(tab.path, value, base)} onScroll={sync.sourceScrolled} onScrollTarget={sync.sourceTarget} /></Suspense>
        {split && <div role="separator" tabIndex={0} aria-label={content.splitResize} aria-orientation="vertical" aria-valuemin={20} aria-valuemax={80} aria-valuenow={sizing.ratio} className="group absolute inset-y-0 right-0 z-20 flex w-3 touch-none cursor-col-resize justify-end outline-none" {...sizing.separator}>
          <span className="pointer-events-none h-full w-0.5 rounded-full bg-transparent opacity-90 transition-all duration-150 group-hover:w-1.5 group-hover:bg-primary group-active:w-1.5 group-active:bg-primary group-focus-visible:w-1.5 group-focus-visible:bg-primary" />
        </div>}
      </div>}
      {(split || (rendered && mode === "preview")) && <div className="flex min-h-0 min-w-0 flex-col" style={{ width: split ? `${100 - sizing.ratio}%` : "100%" }} data-preview-render-pane>
        {split && <div className="flex h-10 shrink-0 items-center bg-muted/50 px-3 text-xs text-secondary-foreground">{content.preview}</div>}
        {kind === "markdown" ? <div ref={markdownRef} className="min-h-0 flex-1 overflow-auto p-8" data-preview-markdown onScroll={event => sync.previewScrolled(scrollPercent(event.currentTarget))}><MessageMarkdown text={text} basePath={tab.path.slice(0, tab.path.lastIndexOf("/") + 1)} /></div>
          : <HtmlPreview text={text} onScroll={sync.previewScrolled} onScrollTarget={sync.previewTarget} />}
      </div>}
    </div>
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border px-3 text-[11px] text-muted-foreground"><span>{formatFileBytes(bytes)}</span><span>{saving ? content.saving : editable ? editor.drafts[tab.path] !== undefined ? content.unsaved : content.saved : content.readOnly}</span></div>
  </>;
}
