import { Brain, Wrench } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { FlowMessage } from "./map-conversation";
import { zhCN } from "@/locales/zh-CN";

/** Read real browser line boxes, so a long reply contributes its last lines. */
function lastLines(element: HTMLElement, limit: number): { start: number; text: string }[] {
  const node = element.firstChild;
  if (!(node instanceof Text) || node.length === 0) return [];
  const textNode = node;
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const tops = [...new Set(Array.from(range.getClientRects(), (rect) => rect.top))];
  function lineStart(top: number) {
    let left = 0;
    let right = textNode.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      range.setStart(textNode, middle);
      range.setEnd(textNode, middle + 1);
      if (range.getBoundingClientRect().top < top - 0.5) left = middle + 1;
      else right = middle;
    }
    return left;
  }
  return tops.slice(-limit).map((top, index, selected) => {
    const start = lineStart(top);
    const end = index + 1 < selected.length ? lineStart(selected[index + 1]!) : textNode.length;
    return { start, text: textNode.data.slice(start, end).trim() };
  }).filter((line) => line.text !== "");
}

function FlowIcon({ kind }: { readonly kind: FlowMessage["kind"] }) {
  if (kind === "reasoning") return <Brain className="size-3.5 shrink-0" aria-hidden="true" />;
  if (kind === "tool-call") return <Wrench className="size-3.5 shrink-0" aria-hidden="true" />;
  return null;
}

export function MapMessageFlow({ rows, onOpen }: {
  readonly rows: readonly FlowMessage[];
  readonly onOpen: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<FlowMessage[]>([]);

  useLayoutEffect(() => {
    const container = root.current;
    const track = measure.current;
    if (container === null || track === null) return;
    let active = true;
    function update() {
      if (!active) return;
      const next: FlowMessage[] = [];
      const elements = track!.querySelectorAll<HTMLElement>("[data-flow-text]");
      for (let index = rows.length - 1; index >= 0 && next.length < 2; index -= 1) {
        const row = rows[index]!;
        const element = elements[index];
        if (element === undefined) throw new Error("Map flow measurement is missing a conversation row.");
        const wrapped = lastLines(element, 2 - next.length);
        next.unshift(...wrapped.map((line) => ({ ...row, id: `${row.id}:${line.start}`, text: line.text })));
      }
      setLines((current) => current.length === next.length && current.every((line, index) => {
        const other = next[index]!;
        return line.id === other.id && line.text === other.text && line.role === other.role && line.kind === other.kind;
      }) ? current : next);
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    void document.fonts.ready.then(update);
    return () => { active = false; observer.disconnect(); };
  }, [rows]);

  return <div ref={root} className="map-flow" aria-label={zhCN.mapConversation.messages}>
    <div ref={measure} className="map-flow-measure" aria-hidden="true" inert>
      {rows.map((row) => <div key={row.id} className="map-flow-bubble" data-role={row.role}>
        <FlowIcon kind={row.kind} />
        <span className="map-flow-text" data-flow-text>{row.text}</span>
      </div>)}
    </div>
    {lines.map((line) => <button
      type="button"
      key={line.id}
      onClick={onOpen}
      className="map-flow-bubble"
      data-role={line.role}
      data-kind={line.kind}
      aria-label={`${zhCN.mapConversation.history} · ${line.text}`}
    >
      <FlowIcon kind={line.kind} />
      <span className="map-flow-text">{line.text}</span>
    </button>)}
  </div>;
}
