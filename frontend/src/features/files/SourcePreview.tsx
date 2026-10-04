import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { LanguageDescription, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { searchKeymap } from "@codemirror/search";
import { useEffect, useRef, useState } from "react";

import { filePreviewError, LoadingPreview, PreviewNotice } from "./preview-status";

export default function SourcePreview({ text, path, line }: { readonly text: string; readonly path: string; readonly line: number | undefined }) {
  const root = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true; let view: EditorView | undefined;
    async function create() {
      const language = LanguageDescription.matchFilename(languages, path);
      const support = language === null ? null : await language.load();
      if (!active) return;
      const state = EditorState.create({ doc: text, extensions: [
        EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(), keymap.of(searchKeymap), syntaxHighlighting(defaultHighlightStyle),
        ...(support === null ? [] : [support]),
        EditorView.theme({
          "&": { height: "100%", fontSize: "12px", backgroundColor: "var(--background)", color: "var(--foreground)" },
          ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
          ".cm-content": { lineHeight: "1.7", padding: "8px 0" },
          ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", borderRight: "1px solid var(--border)" },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb,var(--primary) 10%,transparent)" },
          ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
        }),
      ] });
      view = new EditorView({ state, parent: root.current! });
      if (line !== undefined && line <= state.doc.lines) {
        const target = state.doc.line(line).from;
        view.dispatch({ selection: { anchor: target }, effects: EditorView.scrollIntoView(target, { y: "center" }) });
      }
      setLoading(false);
    }
    void create().catch(error => { if (!active) return; console.error("[files] Source viewer failed.", { path, error }); setError(error); setLoading(false); });
    return () => { active = false; view?.destroy(); };
  }, [text, path, line]);
  return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-preview-source data-preview-target-line={line}>
    {loading && <LoadingPreview />}
    {error !== null && <PreviewNotice text={filePreviewError(error)} danger />}
    <div ref={root} className={`min-h-0 flex-1 ${loading || error !== null ? "hidden" : ""}`} />
  </div>;
}
