import { Button } from "@/components/ui/button";
import { ToolStatusBadge } from "@/features/agent/tools/ToolActivityParts";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import {
  getSubagent,
  subagentKeys,
  type Subagent,
} from "@/features/subagents/api";
import { childStatus } from "@/features/subagents/SubagentCard";
import { useSubagents } from "@/features/subagents/SubagentContext";
import css from "@/features/subagents/subagents.module.css";
import { SubagentTranscript } from "@/features/subagents/SubagentTranscript";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import { X } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
const text = zhCN.subagents;
type Tab = "summary" | "conversation" | "trajectory";
const tabs = ["summary", "conversation", "trajectory"] as const;
export default defineComponent(
  (
    componentProps: {
      readonly parentId: string;
      readonly childId: string;
      readonly onClose: () => void;
    },
    { slots: _slots },
  ) => {
    const parentId = computed(() => componentProps.parentId),
      childId = computed(() => componentProps.childId),
      onClose = computed(() => componentProps.onClose);
    const dialog = shallowRef<HTMLDialogElement | null>(null);
    const state = useSubagents();
    const tab = shallowRef<Tab>("summary"),
      setTab = refSetter(tab);
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey: subagentKeys.detail(parentId.value, childId.value),
          queryFn: ({ signal }: { signal: AbortSignal }) =>
            getSubagent(parentId.value, childId.value, signal),
          retry: false,
          refetchInterval: (query: {
            state: { data: Subagent | undefined };
          }) => (query.state.data?.settled_sequence === null ? 1000 : false),
        })),
      ),
    );
    watchMounted([], () => {
      const element = dialog.value;
      if (element === null) return;
      element.showModal();
      return () => element.close();
    });
    const child = computed(() => (query.isError ? undefined : query.data));
    return () => {
      const _onClose = onClose.value,
        _child = child.value,
        _childId = childId.value;
      return (
        <dialog
          ref={dialog}
          class={css.dialog}
          aria-labelledby="subagent-title"
          onCancel={(event) => {
            event.preventDefault();
            _onClose();
          }}
          onKeydown={(event) => event.stopPropagation()}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const rect = (
                event.currentTarget as HTMLElement
              ).getBoundingClientRect();
              if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
              )
                _onClose();
            }
          }}
        >
          <div class={css.shell}>
            <header class={css.header}>
              <h2 id="subagent-title" class={css.title}>
                {_child === undefined ? text.title : _child.description}
              </h2>
              {_child !== undefined && (
                <>
                  <ToolStatusBadge
                    status={childStatus(_child)}
                    label={text.status[_child.status]}
                  />
                  <span class="text-xs text-muted-foreground">
                    {text.status[_child.status]}
                  </span>
                  {_child.settled_sequence === null && !state.archived && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={state.cancel.isPending}
                      onClick={() => state.cancel.mutate(_childId)}
                    >
                      {state.cancel.isPending ? text.cancelling : text.cancel}
                    </Button>
                  )}
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-7 shrink-0"
                onClick={_onClose}
                aria-label={text.close}
              >
                <X size={16} />
              </Button>
            </header>
            <div class={css.tabs} role="tablist" aria-label={text.title}>
              {tabs.map((name, index) => (
                <button
                  type="button"
                  key={name}
                  role="tab"
                  id={`subagent-tab-${name}`}
                  aria-controls="subagent-panel"
                  aria-selected={tab.value === name}
                  tabindex={tab.value === name ? 0 : -1}
                  onClick={() => setTab(name)}
                  onKeydown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? tabs[0]
                        : event.key === "End"
                          ? tabs[2]
                          : tabs[
                              (index + (event.key === "ArrowRight" ? 1 : 2)) %
                                tabs.length
                            ]!;
                    setTab(next);
                    document.getElementById(`subagent-tab-${next}`)?.focus();
                  }}
                >
                  {text.tabs[name]}
                </button>
              ))}
            </div>
            {state.cancel.isError && state.cancel.variables === _childId && (
              <p role="alert" class="px-4 py-2 text-xs text-destructive">
                {state.cancel.error.message}
              </p>
            )}
            <div
              class={css.body}
              id="subagent-panel"
              role="tabpanel"
              aria-labelledby={`subagent-tab-${tab.value}`}
            >
              {query.isPending && (
                <p role="status" class="p-5 text-sm text-muted-foreground">
                  {text.loading}
                </p>
              )}
              {query.isError && (
                <div role="alert" class="p-5 text-sm text-destructive">
                  {text.loadFailed}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void query.refetch()}
                  >
                    {zhCN.conversation.retry}
                  </Button>
                </div>
              )}
              {_child !== undefined &&
                (tab.value === "summary" ? (
                  <div class={css.summary}>
                    <div class={css.facts}>
                      <span>
                        {text.model} · {_child.model_snapshot.model_id}
                      </span>
                      {_child.model_snapshot.reasoning_effort !== null && (
                        <span>
                          {text.reasoning} ·{" "}
                          {_child.model_snapshot.reasoning_effort}
                        </span>
                      )}
                      <span>{text.readonly}</span>
                      {_child.step !== null && (
                        <span>{text.step(_child.step)}</span>
                      )}
                    </div>
                    <h3>{text.prompt}</h3>
                    <div class={css.prompt}>{_child.prompt}</div>
                    <div class="mt-4 flex items-center justify-between">
                      <h3>{text.report}</h3>
                      {_child.output !== null && (
                        <CopyButton text={_child.output} />
                      )}
                    </div>
                    {_child.output !== null ? (
                      _child.output === "" ? (
                        <p class="text-muted-foreground">{text.noReport}</p>
                      ) : (
                        <MessageMarkdown text={_child.output} />
                      )
                    ) : (
                      <p class="text-muted-foreground">{text.awaitingReport}</p>
                    )}
                    {_child.reason !== null && (
                      <p
                        class={
                          _child.status === "failed"
                            ? "mt-3 text-destructive"
                            : "mt-3 text-muted-foreground"
                        }
                      >
                        {_child.reason}
                      </p>
                    )}
                  </div>
                ) : (
                  <SubagentTranscript child={_child} tab={tab.value} />
                ))}
            </div>
          </div>
        </dialog>
      );
    };
  },
  {
    name: "SubagentDialog",
    inheritAttrs: false,
    props: ["parentId", "childId", "onClose"],
  },
);
