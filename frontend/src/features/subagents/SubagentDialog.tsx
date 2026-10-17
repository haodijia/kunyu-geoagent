import { Button } from "@/components/ui/button";
import { ToolStatusBadge } from "@/features/agent/tools/ToolActivityParts";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import { getSubagent, subagentKeys } from "@/features/subagents/api";
import { childStatus } from "@/features/subagents/SubagentCard";
import { useSubagents } from "@/features/subagents/SubagentContext";
import css from "@/features/subagents/subagents.module.css";
import { SubagentTranscript } from "@/features/subagents/SubagentTranscript";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

const text = zhCN.subagents;
type Tab = "summary" | "conversation" | "trajectory";
const tabs = ["summary", "conversation", "trajectory"] as const;
export default function SubagentDialog({
  parentId,
  childId,
  onClose,
}: {
  readonly parentId: string;
  readonly childId: string;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const state = useSubagents();
  const [tab, setTab] = useState<Tab>("summary");
  const query = useQuery({
    queryKey: subagentKeys.detail(parentId, childId),
    queryFn: ({ signal }) => getSubagent(parentId, childId, signal),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.settled_sequence === null ? 1000 : false,
  });
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    element.showModal();
    return () => element.close();
  }, []);
  const child = query.isError ? undefined : query.data;
  return (
    <dialog
      ref={dialog}
      className={css.dialog}
      aria-labelledby="subagent-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className={css.shell}>
        <header className={css.header}>
          <h2 id="subagent-title" className={css.title}>
            {child === undefined ? text.title : child.description}
          </h2>
          {child !== undefined && (
            <>
              <ToolStatusBadge
                status={childStatus(child)}
                label={text.status[child.status]}
              />
              <span className="text-xs text-muted-foreground">
                {text.status[child.status]}
              </span>
              {child.settled_sequence === null && !state.archived && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={state.cancel.isPending}
                  onClick={() => state.cancel.mutate(childId)}
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
            className="size-7 shrink-0"
            onClick={onClose}
            aria-label={text.close}
          >
            <X size={16} />
          </Button>
        </header>
        <div className={css.tabs} role="tablist" aria-label={text.title}>
          {tabs.map((name, index) => (
            <button
              type="button"
              key={name}
              role="tab"
              id={`subagent-tab-${name}`}
              aria-controls="subagent-panel"
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
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
        {state.cancel.isError && state.cancel.variables === childId && (
          <p role="alert" className="px-4 py-2 text-xs text-destructive">
            {state.cancel.error.message}
          </p>
        )}
        <div
          className={css.body}
          id="subagent-panel"
          role="tabpanel"
          aria-labelledby={`subagent-tab-${tab}`}
        >
          {query.isPending && (
            <p role="status" className="p-5 text-sm text-muted-foreground">
              {text.loading}
            </p>
          )}
          {query.isError && (
            <div role="alert" className="p-5 text-sm text-destructive">
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
          {child !== undefined &&
            (tab === "summary" ? (
              <div className={css.summary}>
                <div className={css.facts}>
                  <span>
                    {text.model} · {child.model_snapshot.model_id}
                  </span>
                  {child.model_snapshot.reasoning_effort !== null && (
                    <span>
                      {text.reasoning} · {child.model_snapshot.reasoning_effort}
                    </span>
                  )}
                  <span>{text.readOnly}</span>
                  {child.step !== null && <span>{text.step(child.step)}</span>}
                </div>
                <h3>{text.prompt}</h3>
                <div className={css.prompt}>{child.prompt}</div>
                <div className="mt-4 flex items-center justify-between">
                  <h3>{text.report}</h3>
                  {child.output !== null && <CopyButton text={child.output} />}
                </div>
                {child.output !== null ? (
                  child.output === "" ? (
                    <p className="text-muted-foreground">{text.noReport}</p>
                  ) : (
                    <MessageMarkdown text={child.output} />
                  )
                ) : (
                  <p className="text-muted-foreground">{text.awaitingReport}</p>
                )}
                {child.reason !== null && (
                  <p
                    className={
                      child.status === "failed"
                        ? "mt-3 text-destructive"
                        : "mt-3 text-muted-foreground"
                    }
                  >
                    {child.reason}
                  </p>
                )}
              </div>
            ) : (
              <SubagentTranscript child={child} tab={tab} />
            ))}
        </div>
      </div>
    </dialog>
  );
}
