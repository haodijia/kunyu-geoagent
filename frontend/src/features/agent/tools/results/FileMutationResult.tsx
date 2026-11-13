import {
  diffRows,
  parseFileMutationResult,
} from "@/features/agent/tools/results/file-diffs";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent } from "vue";
const content = zhCN.conversation.tools.files;
export const FileMutationResult = defineComponent(
  (
    componentProps: {
      readonly value: unknown;
      readonly text: string;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      text = computed(() => componentProps.text);
    const result = computed(() => parseFileMutationResult(value.value));
    const rows = computed(() => diffRows(result.value));
    const additions = computed(
      () => rows.value.filter((row) => row.kind === "addition").length,
    );
    const deletions = computed(
      () => rows.value.filter((row) => row.kind === "deletion").length,
    );
    const name = computed(() => result.value.path.split("/").at(-1)!);
    return () => {
      const _result = result.value,
        _name = name.value,
        _additions = additions.value,
        _deletions = deletions.value,
        _text = text.value;
      return (
        <div
          class="mb-2 min-w-0 overflow-hidden rounded-lg border border-border"
          data-file-diff-path={_result.path}
        >
          <div class="flex min-w-0 items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
            <div class="flex min-w-0 items-center gap-2" title={_result.path}>
              <span class="size-2 shrink-0 rounded-full bg-[var(--mu-diff-add)]" />
              <span class="truncate text-sm font-medium">{_name}</span>
              <span class="shrink-0 text-[11px] text-secondary-foreground">
                {_result.operation === "create"
                  ? content.created
                  : content.updated}
              </span>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              {(_additions > 0 || _deletions > 0) && (
                <span
                  class="flex gap-1 px-1 py-0.5"
                  aria-label={content.changes(_result.path)}
                >
                  {_additions > 0 && (
                    <span
                      class="text-sm font-medium text-[var(--mu-diff-add)]"
                      aria-label={content.additions(_additions)}
                    >
                      +{_additions}
                    </span>
                  )}
                  {_deletions > 0 && (
                    <span
                      class="text-sm font-medium text-[var(--mu-diff-del)]"
                      aria-label={content.deletions(_deletions)}
                    >
                      −{_deletions}
                    </span>
                  )}
                </span>
              )}
              <CopyButton text={_text} />
            </div>
          </div>
          {_additions === 0 && _deletions === 0 && (
            <p class="m-0 px-4 pb-3 text-xs text-secondary-foreground">
              {content.unchanged}
            </p>
          )}
        </div>
      );
    };
  },
  {
    name: "FileMutationResult",
    inheritAttrs: false,
    props: ["value", "text"],
  },
);
