import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { LanguageDescription, bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { useEffect, useRef, useState } from "react";

import { scrollPercent, type PreviewScrollTarget } from "./usePreviewScrollSync";
import { filePreviewError, LoadingPreview, PreviewNotice } from "./preview-status";

interface Props {
  readonly text: string; readonly path: string; readonly line: number | undefined;
  readonly readOnly: boolean; onChange(text: string): void;
  onScroll(percent: number): void; onScrollTarget(target: PreviewScrollTarget | null): void;
}
export default function SourceEditor({ text, path, line, readOnly, onChange, onScroll, onScrollTarget }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const current = useRef({ text, line, readOnly, onChange, onScroll, onScrollTarget }); current.current = { text, line, readOnly, onChange, onScroll, onScrollTarget };
  const readonly = useRef(new Compartment());
  const synchronizing = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    let scrollFrame: number | null = null;
    async function create() {
      const language = LanguageDescription.matchFilename(languages, path);
      const support = language === null ? null : await language.load();
      if (!active) return;
      const value = current.current;
      let targetPercent: number | null = null;
      const state = EditorState.create({ doc: value.text, extensions: [
        readonly.current.of([EditorState.readOnly.of(value.readOnly), EditorView.editable.of(!value.readOnly)]),
        ...(value.text.includes("\r\n") ? [EditorState.lineSeparator.of("\r\n")] : []),
        history(), lineNumbers(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(), EditorView.lineWrapping,
        foldGutter(), indentOnInput(), bracketMatching(), highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]), syntaxHighlighting(defaultHighlightStyle),
        ...(support === null ? [] : [support]),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !synchronizing.current) current.current.onChange(update.state.sliceDoc());
          if (update.geometryChanged && targetPercent === null) update.view.requestMeasure({
            key: update.view.dom,
            read: view => scrollPercent(view.scrollDOM),
            write: percent => { if (active && targetPercent === null) current.current.onScroll(percent); },
          });
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "12px", backgroundColor: "var(--background)", color: "var(--foreground)" },
          ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
          ".cm-content": { lineHeight: "1.7", padding: "8px 0" },
          ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", borderRight: "1px solid var(--border)" },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb,var(--primary) 10%,transparent)" },
          ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
        }),
      ] });
      const view = new EditorView({ state, parent: root.current! }); editor.current = view;
      const calibrate = () => {
        if (scrollFrame !== null) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = null;
          view.requestMeasure({
            key: view.scrollDOM,
            read: () => ({ top: view.scrollDOM.scrollTop, range: Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight) }),
            write: position => {
              if (!active || targetPercent === null) return;
              const top = targetPercent * position.range;
              if (Math.abs(position.top - top) > 1) {
                view.scrollDOM.scrollTo({ top, behavior: "instant" });
                calibrate();
              } else {
                targetPercent = null;
                current.current.onScroll(position.range > 0 ? position.top / position.range : 0);
              }
            },
          });
        });
      };
      value.onScrollTarget({
        getPercent: () => scrollPercent(view.scrollDOM),
        scrollToPercent: percent => {
          targetPercent = percent;
          view.scrollDOM.scrollTo({ top: percent * Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight), behavior: "instant" });
          calibrate();
        },
      });
      view.scrollDOM.addEventListener("scroll", () => { if (targetPercent === null) current.current.onScroll(scrollPercent(view.scrollDOM)); }, { passive: true });
      const interruptScroll = () => { targetPercent = null; };
      for (const event of ["wheel", "pointerdown", "touchstart", "keydown"]) view.dom.addEventListener(event, interruptScroll, { passive: true });
      if (value.line !== undefined && value.line <= state.doc.lines) {
        const target = state.doc.line(value.line).from;
        view.dispatch({ selection: { anchor: target }, effects: EditorView.scrollIntoView(target, { y: "center" }) });
      }
      setLoading(false);
    }
    void create().catch(error => { if (!active) return; console.error("[files] Source editor failed.", { path, error }); setError(error); setLoading(false); });
    return () => { active = false; if (scrollFrame !== null) cancelAnimationFrame(scrollFrame); current.current.onScrollTarget(null); editor.current?.destroy(); editor.current = null; };
  }, [path]);
  useEffect(() => {
    const view = editor.current;
    if (view === null || view.state.sliceDoc() === text) return;
    synchronizing.current = true;
    try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: Transaction.addToHistory.of(false) }); }
    finally { synchronizing.current = false; }
  }, [text]);
  useEffect(() => { editor.current?.dispatch({ effects: readonly.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) }); }, [readOnly]);
  useEffect(() => {
    const view = editor.current;
    if (view !== null && line !== undefined && line <= view.state.doc.lines) {
      const target = view.state.doc.line(line).from;
      view.dispatch({ selection: { anchor: target }, effects: EditorView.scrollIntoView(target, { y: "center" }) });
    }
  }, [line]);
  return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-preview-source data-preview-target-line={line}>
    {loading && <LoadingPreview />}
    {error !== null && <PreviewNotice text={filePreviewError(error)} danger />}
    <div ref={root} className={`min-h-0 flex-1 ${loading || error !== null ? "hidden" : ""}`} />
  </div>;
}
