import { parseSearchResult } from "@/features/agent/tools/results/search-result";
import styles from "@/features/agent/tools/ToolActivity.module.css";
import { ToolResultPanel } from "@/features/agent/tools/ToolActivityParts";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { FileImage, FileText } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
const content = zhCN.conversation.tools;
export const SearchResult = defineComponent(
  (
    componentProps: {
      readonly value: unknown;
      readonly text: string;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      text = computed(() => componentProps.text);
    const result = computed(() => parseSearchResult(value.value));
    const kept = computed(() =>
      result.value.shape === "paths"
        ? result.value.paths.length
        : result.value.files.reduce(
            (total, file) => total + file.matches.length,
            0,
          ),
    );
    return () => {
      const _result = result.value,
        _kept = kept.value,
        _text = text.value;
      return (
        <div class="min-w-0" data-search-shape={_result.shape}>
          <ToolResultPanel
            label={content.search.count(_result.shape, _kept, _result.total)}
            copyText={_text}
          >
            {_kept === 0 ? (
              <p class={styles.resultEmpty}>
                {content.search.empty(_result.shape)}
              </p>
            ) : (
              <div
                class={styles.resultList}
                role="region"
                aria-label={content.search.results}
                tabindex={0}
              >
                {_result.shape === "paths" ? (
                  <ul class="m-0 list-none p-0">
                    {_result.paths.map((path, index) => (
                      <li
                        key={index}
                        class={styles.resultPath}
                        data-search-path={path}
                      >
                        <PathIcon path={path} />
                        <span>{path}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  _result.files.map((file) => (
                    <div
                      key={file.path}
                      class="border-b border-border last:border-b-0"
                      data-search-path={file.path}
                    >
                      <div
                        class={`${styles.resultPath} border-b border-border bg-muted/50`}
                      >
                        <PathIcon path={file.path} />
                        <span>{file.path}</span>
                      </div>
                      <table class="w-full border-collapse font-mono text-xs leading-relaxed">
                        <tbody>
                          {file.matches.map((match, index) => (
                            <tr key={index} data-search-line={match.lineNumber}>
                              <td class="w-px px-2.5 py-1 text-right align-top text-muted-foreground">
                                <span class="min-w-0 truncate [overflow-wrap:anywhere]">
                                  {match.lineNumber}
                                </span>
                              </td>
                              <td class="py-1 pr-2.5 align-top whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]">
                                {match.line || "\u00a0"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}
          </ToolResultPanel>
          {_result.truncated && (
            <p class="mt-1 mb-0 text-[11px] text-secondary-foreground">
              {content.search.capped}
            </p>
          )}
          {_result.artifact_path !== null && (
            <div class="mt-1 flex min-w-0 items-start gap-2 text-[11px] text-secondary-foreground">
              <span class="min-w-0 truncate [overflow-wrap:anywhere]">
                {content.search.artifact(_result.artifact_path)}
              </span>
              <CopyButton text={_result.artifact_path} />
            </div>
          )}
        </div>
      );
    };
  },
  {
    name: "SearchResult",
    inheritAttrs: false,
    props: ["value", "text"],
  },
);
const PathIcon = defineComponent(
  (
    componentProps: {
      readonly path: string;
    },
    { slots: _slots },
  ) => {
    const path = computed(() => componentProps.path);
    const Icon = computed(() =>
      /\.(?:png|jpe?g|webp|gif)$/i.test(path.value) ? FileImage : FileText,
    );
    return () => {
      return (
        <Icon.value
          class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      );
    };
  },
  {
    name: "PathIcon",
    inheritAttrs: false,
    props: ["path"],
  },
);
