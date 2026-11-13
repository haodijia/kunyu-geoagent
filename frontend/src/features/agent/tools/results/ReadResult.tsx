import { parseReadResult } from "@/features/agent/tools/results/read-result";
import { ToolResultPanel } from "@/features/agent/tools/ToolActivityParts";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent } from "vue";
const content = zhCN.conversation.tools;
export const ReadResult = defineComponent(
  (
    componentProps: {
      readonly value: unknown;
      readonly text: string;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      text = computed(() => componentProps.text);
    const result = computed(() => parseReadResult(value.value));
    const end = computed(
      () =>
        result.value.lines.at(-1)?.number ??
        Math.max(0, result.value.offset - 1),
    );
    return () => {
      const _result = result.value,
        _text = text.value,
        _end = end.value;
      return (
        <div class="min-w-0" data-read-path={_result.path}>
          <ToolResultPanel
            label={`${_result.path}${_result.lang === undefined ? "" : ` · ${_result.lang}`}`}
            copyText={_text}
          >
            {_result.lines.length > 0 && (
              <div
                class="max-h-80 overflow-auto py-2"
                role="region"
                aria-label={content.read.lines(_result.path)}
                tabindex={0}
              >
                <table class="w-full border-collapse font-mono text-xs leading-relaxed">
                  <tbody>
                    {_result.lines.map((line) => (
                      <tr key={line.number} data-line-number={line.number}>
                        <td
                          class="w-px px-2.5 text-right align-top text-muted-foreground select-none"
                          aria-hidden="true"
                        >
                          {line.number}
                        </td>
                        <td class="pr-2.5 align-top whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]">
                          {line.text || "\u00a0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p class="m-0 border-t border-border px-3 py-1.5 text-[11px] text-secondary-foreground">
              {_end >= _result.total_lines
                ? content.read.end(_result.total_lines)
                : _result.truncated_by_bytes
                  ? content.read.capped(_result.offset, _end, _end + 1)
                  : content.read.window(
                      _result.offset,
                      _end,
                      _result.total_lines,
                      _end + 1,
                    )}
            </p>
          </ToolResultPanel>
        </div>
      );
    };
  },
  {
    name: "ReadResult",
    inheritAttrs: false,
    props: ["value", "text"],
  },
);
