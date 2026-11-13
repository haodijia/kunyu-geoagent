import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { refSetter } from "@/lib/lifecycle";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { BookOpen, FileText, Pencil, Plus, Sparkles } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import {
  getInstructions,
  instructionKey,
  overviewKey,
  saveInstructions,
  saveMemory,
  type WorkspaceMemory,
} from "./overview-api";
type Editor =
  | {
      kind: "memory";
      original: WorkspaceMemory | null;
      text: string;
    }
  | {
      kind: "instructions";
      version: string | null;
      text: string;
    };
export const WorkspaceKnowledge = defineComponent(
  (
    componentProps: {
      readonly workspaceId: string;
      readonly memories: readonly WorkspaceMemory[];
      readonly count: number;
    },
    { slots: _slots },
  ) => {
    const workspaceId = computed(() => componentProps.workspaceId),
      memories = computed(() => componentProps.memories),
      count = computed(() => componentProps.count);
    const tab = shallowRef<"memory" | "instructions">("memory"),
      setTab = refSetter(tab);
    const editor = shallowRef<Editor | null>(null),
      setEditor = refSetter(editor);
    const client = useQueryClient();
    const instructions = reactive(
      useQuery(
        computed(() => ({
          queryKey: instructionKey(workspaceId.value),
          queryFn: ({ signal }: { signal: AbortSignal }) =>
            getInstructions(workspaceId.value, signal),
          enabled: tab.value === "instructions",
        })),
      ),
    );
    const save = reactive(
      useMutation({
        mutationFn: async (draft: Editor) => {
          if (draft.kind === "memory")
            await saveMemory(
              workspaceId.value,
              draft.text.trim(),
              draft.original,
            );
          else
            await saveInstructions(workspaceId.value, {
              content: draft.text,
              version: draft.version,
            });
        },
        onSuccess: async () => {
          setEditor(null);
          await Promise.all([
            client.invalidateQueries({
              queryKey: overviewKey(workspaceId.value),
            }),
            client.invalidateQueries({
              queryKey: instructionKey(workspaceId.value),
            }),
            client.invalidateQueries({
              queryKey: ["workspace-files", workspaceId.value],
            }),
          ]);
        },
        onError: (error) =>
          console.error("[overview] Knowledge save failed", error),
      }),
    );
    const edit = (draft: Editor) => {
      save.reset();
      setEditor(draft);
    };
    return () => {
      const _count = count.value,
        _memories = memories.value;
      return (
        <section
          class="overview-panel overview-knowledge"
          aria-label={copy.knowledge}
        >
          <header class="overview-panel-heading">
            <span class="overview-icon">
              <BookOpen />
            </span>
            <div>
              <h2>{copy.knowledge}</h2>
              <p>{copy.knowledgeHint}</p>
            </div>
            <div
              class="overview-segment ml-auto"
              role="group"
              aria-label={copy.knowledge}
            >
              <button
                disabled={editor.value !== null}
                aria-pressed={tab.value === "memory"}
                onClick={() => setTab("memory")}
              >
                {copy.memories}
                <span>{_count}</span>
              </button>
              <button
                disabled={editor.value !== null}
                aria-pressed={tab.value === "instructions"}
                onClick={() => setTab("instructions")}
              >
                {copy.instructions}
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={
                editor.value !== null ||
                (tab.value === "instructions" && !instructions.isSuccess)
              }
              aria-label={
                tab.value === "memory" ? copy.addMemory : copy.editInstructions
              }
              onClick={() =>
                tab.value === "memory"
                  ? edit({
                      kind: "memory",
                      original: null,
                      text: "",
                    })
                  : instructions.data !== undefined &&
                    edit({
                      kind: "instructions",
                      version: instructions.data.version,
                      text: instructions.data.content,
                    })
              }
            >
              {tab.value === "memory" ? (
                <Plus class="size-3.5" />
              ) : (
                <Pencil class="size-3.5" />
              )}
            </Button>
          </header>
          {editor.value !== null ? (
            <form
              class="overview-knowledge-editor"
              onSubmit={(event) => {
                event.preventDefault();
                if (editor.value === null)
                  throw new Error("Knowledge editor is closed.");
                save.mutate(editor.value);
              }}
            >
              <Textarea
                autofocus
                aria-label={
                  editor.value.kind === "memory"
                    ? copy.memoryContent
                    : copy.instructionContent
                }
                value={editor.value.text}
                maxlength={editor.value.kind === "memory" ? 2000 : 131072}
                onInput={(event) =>
                  setEditor((current) => {
                    if (current === null)
                      throw new Error("Knowledge editor is closed.");
                    return {
                      ...current,
                      text: (event.target as HTMLInputElement).value,
                    };
                  })
                }
                class="min-h-0 flex-1 resize-none text-xs leading-6"
              />
              {save.isError && (
                <p class="text-xs text-destructive" role="alert">
                  {save.error.message}
                </p>
              )}
              <div class="flex items-center justify-between gap-3">
                <span class="overview-caption">
                  {editor.value.kind === "memory"
                    ? `${editor.value.text.length} / 2000`
                    : copy.instructionHint}
                </span>
                <div class="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={save.isPending}
                    onClick={() => setEditor(null)}
                  >
                    {copy.cancel}
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      save.isPending ||
                      (editor.value.kind === "memory" &&
                        !editor.value.text.trim())
                    }
                    type="submit"
                  >
                    {save.isPending ? copy.saving : copy.save}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div class="overview-knowledge-content">
              {tab.value === "memory" ? (
                _memories.length === 0 ? (
                  <KnowledgeEmpty
                    Icon={Sparkles}
                    title={copy.noMemories}
                    hint={copy.noMemoriesHint}
                  />
                ) : (
                  <div class="overview-memory-list">
                    {_memories.map((memory, index) => (
                      <article key={memory.id} class="overview-memory">
                        <span class="overview-memory-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div class="min-w-0 flex-1">
                          <p>{memory.content}</p>
                          <time datetime={memory.created_at}>
                            {new Date(memory.created_at).toLocaleDateString(
                              "zh-CN",
                            )}
                          </time>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={copy.editMemory}
                          onClick={() =>
                            edit({
                              kind: "memory",
                              original: memory,
                              text: memory.content,
                            })
                          }
                        >
                          <Pencil class="size-3" />
                        </Button>
                      </article>
                    ))}
                    {_count > _memories.length && (
                      <p class="overview-caption">{copy.memoryLimit}</p>
                    )}
                  </div>
                )
              ) : instructions.isPending ? (
                <p class="overview-message" role="status">
                  {copy.loading}
                </p>
              ) : instructions.isError ? (
                <p class="overview-message text-destructive" role="alert">
                  {instructions.error.message}
                </p>
              ) : instructions.data.version === null ? (
                <KnowledgeEmpty
                  Icon={FileText}
                  title={copy.noInstructions}
                  hint={copy.noInstructionsHint}
                />
              ) : (
                <div class="overview-instructions">
                  <p class="overview-caption">{copy.instructionHint}</p>
                  <pre>{instructions.data.content}</pre>
                  <p class="overview-caption">{copy.instructionNote}</p>
                </div>
              )}
            </div>
          )}
        </section>
      );
    };
  },
  {
    name: "WorkspaceKnowledge",
    inheritAttrs: false,
    props: ["workspaceId", "memories", "count"],
  },
);
const KnowledgeEmpty = defineComponent(
  (
    componentProps: {
      readonly Icon: typeof BookOpen;
      readonly title: string;
      readonly hint: string;
    },
    { slots: _slots },
  ) => {
    const Icon = computed(() => componentProps.Icon),
      title = computed(() => componentProps.title),
      hint = computed(() => componentProps.hint);
    return () => {
      const _title = title.value,
        _hint = hint.value;
      return (
        <div class="overview-empty">
          <span class="overview-empty-mark">
            <Icon.value strokeWidth={1.25} />
          </span>
          <h3>{_title}</h3>
          <p>{_hint}</p>
        </div>
      );
    };
  },
  {
    name: "KnowledgeEmpty",
    inheritAttrs: false,
    props: ["Icon", "title", "hint"],
  },
);
