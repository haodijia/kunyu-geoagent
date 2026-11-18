import type { FlowMessage } from "@/features/maps/conversation/map-conversation";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Brain, Wrench } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, watch } from "vue";
/** Read real browser line boxes, so a long reply contributes its last lines. */
function lastLines(
  element: HTMLElement,
  limit: number,
): {
  start: number;
  text: string;
}[] {
  const node = element.firstChild;
  if (!(node instanceof Text) || node.length === 0) return [];
  const textNode = node;
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const tops = [
    ...new Set(Array.from(range.getClientRects(), (rect) => rect.top)),
  ];
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
  return tops
    .slice(-limit)
    .map((top, index, selected) => {
      const start = lineStart(top);
      const end =
        index + 1 < selected.length
          ? lineStart(selected[index + 1]!)
          : textNode.length;
      return {
        start,
        text: textNode.data.slice(start, end).trim(),
      };
    })
    .filter((line) => line.text !== "");
}
const FlowIcon = defineComponent(
  (
    componentProps: {
      readonly kind: FlowMessage["kind"];
    },
    { slots: _slots },
  ) => {
    const kind = computed(() => componentProps.kind);
    return () => {
      const _kind = kind.value;
      if (_kind === "reasoning")
        return <Brain class="size-3.5 shrink-0" aria-hidden="true" />;
      if (_kind === "tool-call")
        return <Wrench class="size-3.5 shrink-0" aria-hidden="true" />;
      return null;
    };
  },
  {
    name: "FlowIcon",
    inheritAttrs: false,
    props: ["kind"],
  },
);
export const MapMessageFlow = defineComponent(
  (
    componentProps: {
      readonly rows: readonly FlowMessage[];
      readonly onOpen: () => void;
    },
    { slots: _slots },
  ) => {
    const rows = computed(() => componentProps.rows),
      onOpen = computed(() => componentProps.onOpen);
    const root = shallowRef<HTMLDivElement | null>(null);
    const measure = shallowRef<HTMLDivElement | null>(null);
    const lines = shallowRef<FlowMessage[]>([]),
      setLines = refSetter(lines);
    watchMounted([], () => {
      const container = root.value;
      const track = measure.value;
      if (container === null || track === null) return;
      let active = true;
      let frame: number | null = null;
      let width: number | undefined;
      function update() {
        frame = null;
        const next: FlowMessage[] = [];
        const elements =
          track!.querySelectorAll<HTMLElement>("[data-flow-text]");
        for (
          let index = rows.value.length - 1;
          index >= 0 && next.length < 2;
          index -= 1
        ) {
          const row = rows.value[index]!;
          const element = elements[index];
          if (element === undefined)
            throw new Error(
              "Map flow measurement is missing a conversation row.",
            );
          const wrapped = lastLines(element, 2 - next.length);
          next.unshift(
            ...wrapped.map((line) => ({
              ...row,
              id: `${row.id}:${line.start}`,
              text: line.text,
            })),
          );
        }
        setLines((current) =>
          current.length === next.length &&
          current.every((line, index) => {
            const other = next[index]!;
            return (
              line.id === other.id &&
              line.text === other.text &&
              line.role === other.role &&
              line.kind === other.kind
            );
          })
            ? current
            : next,
        );
      }
      const schedule = () => {
        if (active && frame === null) frame = requestAnimationFrame(update);
      };
      const stop = watch(rows, schedule, { flush: "post" });
      const observer = new ResizeObserver(([entry]) => {
        const nextWidth = entry?.contentRect.width;
        if (nextWidth === width) return;
        width = nextWidth;
        schedule();
      });
      observer.observe(container);
      schedule();
      void document.fonts.ready.then(schedule);
      return () => {
        active = false;
        if (frame !== null) cancelAnimationFrame(frame);
        stop();
        observer.disconnect();
      };
    });
    return () => {
      const _rows = rows.value,
        _onOpen = onOpen.value;
      return (
        <div
          ref={root}
          class="map-flow"
          aria-label={zhCN.mapConversation.messages}
        >
          <div ref={measure} class="map-flow-measure" aria-hidden="true" inert>
            {_rows.map((row) => (
              <div key={row.id} class="map-flow-bubble" data-role={row.role}>
                <FlowIcon kind={row.kind} />
                <span class="map-flow-text" data-flow-text>
                  {row.text}
                </span>
              </div>
            ))}
          </div>
          {lines.value.map((line) => (
            <button
              type="button"
              key={line.id}
              onClick={_onOpen}
              class="map-flow-bubble"
              data-role={line.role}
              data-kind={line.kind}
              aria-label={`${zhCN.mapConversation.history} · ${line.text}`}
            >
              <FlowIcon kind={line.kind} />
              <span class="map-flow-text">{line.text}</span>
            </button>
          ))}
        </div>
      );
    };
  },
  {
    name: "MapMessageFlow",
    inheritAttrs: false,
    props: ["rows", "onOpen"],
  },
);
