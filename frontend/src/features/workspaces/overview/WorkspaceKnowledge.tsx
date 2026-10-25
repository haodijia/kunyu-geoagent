import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Pencil, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import {
  getInstructions,
  instructionKey,
  overviewKey,
  saveInstructions,
  saveMemory,
  type WorkspaceMemory,
} from "./overview-api";

type Editor =
  | { kind: "memory"; original: WorkspaceMemory | null; text: string }
  | { kind: "instructions"; version: string | null; text: string };
export function WorkspaceKnowledge({
  workspaceId,
  memories,
  count,
}: {
  readonly workspaceId: string;
  readonly memories: readonly WorkspaceMemory[];
  readonly count: number;
}) {
  const [tab, setTab] = useState<"memory" | "instructions">("memory");
  const [editor, setEditor] = useState<Editor | null>(null);
  const client = useQueryClient();
  const instructions = useQuery({
    queryKey: instructionKey(workspaceId),
    queryFn: ({ signal }) => getInstructions(workspaceId, signal),
    enabled: tab === "instructions",
  });
  const save = useMutation({
    mutationFn: async (draft: Editor) => {
      if (draft.kind === "memory")
        await saveMemory(workspaceId, draft.text.trim(), draft.original);
      else
        await saveInstructions(workspaceId, {
          content: draft.text,
          version: draft.version,
        });
    },
    onSuccess: async () => {
      setEditor(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: overviewKey(workspaceId) }),
        client.invalidateQueries({ queryKey: instructionKey(workspaceId) }),
        client.invalidateQueries({
          queryKey: ["workspace-files", workspaceId],
        }),
      ]);
    },
    onError: (error) =>
      console.error("[overview] Knowledge save failed", error),
  });
  const edit = (draft: Editor) => {
    save.reset();
    setEditor(draft);
  };
  return (
    <section
      className="overview-panel overview-knowledge"
      aria-label={copy.knowledge}
    >
      <header className="overview-panel-heading">
        <span className="overview-icon">
          <BookOpen />
        </span>
        <div>
          <h2>{copy.knowledge}</h2>
          <p>{copy.knowledgeHint}</p>
        </div>
        <div
          className="overview-segment ml-auto"
          role="group"
          aria-label={copy.knowledge}
        >
          <button
            disabled={editor !== null}
            aria-pressed={tab === "memory"}
            onClick={() => setTab("memory")}
          >
            {copy.memories}
            <span>{count}</span>
          </button>
          <button
            disabled={editor !== null}
            aria-pressed={tab === "instructions"}
            onClick={() => setTab("instructions")}
          >
            {copy.instructions}
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={
            editor !== null ||
            (tab === "instructions" && !instructions.isSuccess)
          }
          aria-label={tab === "memory" ? copy.addMemory : copy.editInstructions}
          onClick={() =>
            tab === "memory"
              ? edit({ kind: "memory", original: null, text: "" })
              : instructions.data !== undefined &&
                edit({
                  kind: "instructions",
                  version: instructions.data.version,
                  text: instructions.data.content,
                })
          }
        >
          {tab === "memory" ? (
            <Plus className="size-3.5" />
          ) : (
            <Pencil className="size-3.5" />
          )}
        </Button>
      </header>
      {editor !== null ? (
        <form
          className="overview-knowledge-editor"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(editor);
          }}
        >
          <Textarea
            autoFocus
            aria-label={
              editor.kind === "memory"
                ? copy.memoryContent
                : copy.instructionContent
            }
            value={editor.text}
            maxLength={editor.kind === "memory" ? 2000 : 131072}
            onChange={(event) =>
              setEditor({ ...editor, text: event.target.value })
            }
            className="min-h-0 flex-1 resize-none text-xs leading-6"
          />
          {save.isError && (
            <p className="text-xs text-destructive" role="alert">
              {save.error.message}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="overview-caption">
              {editor.kind === "memory"
                ? `${editor.text.length} / 2000`
                : copy.instructionHint}
            </span>
            <div className="flex gap-2">
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
                  (editor.kind === "memory" && !editor.text.trim())
                }
                type="submit"
              >
                {save.isPending ? copy.saving : copy.save}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="overview-knowledge-content">
          {tab === "memory" ? (
            memories.length === 0 ? (
              <KnowledgeEmpty
                Icon={Sparkles}
                title={copy.noMemories}
                hint={copy.noMemoriesHint}
              />
            ) : (
              <div className="overview-memory-list">
                {memories.map((memory, index) => (
                  <article key={memory.id} className="overview-memory">
                    <span className="overview-memory-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p>{memory.content}</p>
                      <time dateTime={memory.created_at}>
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
                      <Pencil className="size-3" />
                    </Button>
                  </article>
                ))}
                {count > memories.length && (
                  <p className="overview-caption">{copy.memoryLimit}</p>
                )}
              </div>
            )
          ) : instructions.isPending ? (
            <p className="overview-message" role="status">
              {copy.loading}
            </p>
          ) : instructions.isError ? (
            <p className="overview-message text-destructive" role="alert">
              {instructions.error.message}
            </p>
          ) : instructions.data.version === null ? (
            <KnowledgeEmpty
              Icon={FileText}
              title={copy.noInstructions}
              hint={copy.noInstructionsHint}
            />
          ) : (
            <div className="overview-instructions">
              <p className="overview-caption">{copy.instructionHint}</p>
              <pre>{instructions.data.content}</pre>
              <p className="overview-caption">{copy.instructionNote}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
function KnowledgeEmpty({
  Icon,
  title,
  hint,
}: {
  readonly Icon: typeof BookOpen;
  readonly title: string;
  readonly hint: string;
}) {
  return (
    <div className="overview-empty">
      <span className="overview-empty-mark">
        <Icon strokeWidth={1.25} />
      </span>
      <h3>{title}</h3>
      <p>{hint}</p>
    </div>
  );
}
