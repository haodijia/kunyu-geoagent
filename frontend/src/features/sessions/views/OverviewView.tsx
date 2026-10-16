import { ArrowRight, Layers, Map, MessageCircle, RefreshCw, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TodoItems } from "@/features/agent/TodoItems";
import { parseTodos } from "@/features/agent/todos";
import { toolLabel, toolTarget } from "@/features/agent/tool-presentation";
import { OutputCard } from "@/features/analysis/OutputCard";
import { useAnalysis } from "@/features/analysis/useAnalysis";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { sessionAnalysisPath, sessionMapPath } from "@/features/sessions/routes";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { overviewModel } from "./overview-model";

const content = zhCN.overview;
export function OverviewView() {
  const session = useSessionWorkspace();
  const { messagesQuery, agentTurnsQuery } = useSessionMessages();
  const analysis = useAnalysis(session.id);
  const messages = messagesQuery.data ?? [];
  const turns = agentTurnsQuery.data ?? [];
  const model = overviewModel(messages, turns);
  const outputs = analysis.outputs.data ?? [];
  const failed = messagesQuery.isError || agentTurnsQuery.isError || analysis.jobs.isError || analysis.outputs.isError;
  const loading = messagesQuery.isPending || agentTurnsQuery.isPending || analysis.outputs.isPending;
  const conversation = sessionAnalysisPath(session.workspace_id, session.id, "conversation");
  const trace = sessionAnalysisPath(session.workspace_id, session.id, "trace");
  const status = model.turn === undefined ? content.notStarted : zhCN.subagents.status[model.turn.state];
  return <div className="h-full overflow-y-auto">
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">{content.title}</p>
          <h1 className="break-words text-2xl font-semibold tracking-tight">{session.title}</h1>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`size-1.5 rounded-full ${model.active ? "animate-pulse bg-foreground" : "bg-muted-foreground"}`} />
            {status}<span aria-hidden="true">·</span><time dateTime={session.updated_at}>{new Date(session.updated_at).toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
          </p>
        </div>
        <Button asChild size="sm"><Link to={conversation}>{content.continue}<ArrowRight className="size-3.5" /></Link></Button>
      </header>
      {failed && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 p-3 text-xs text-destructive">
        {content.loadFailed}
        <Button variant="ghost" size="sm" onClick={() => void Promise.all([messagesQuery.refetch(), agentTurnsQuery.refetch(), analysis.jobs.refetch(), analysis.outputs.refetch()])}><RefreshCw className="size-3.5" />{content.retry}</Button>
      </div>}
      {loading && <p role="status" className="text-sm text-muted-foreground">{content.loading}</p>}
      <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border py-4">
        {[
          { label: content.turns, value: turns.length, Icon: MessageCircle },
          { label: content.tools, value: model.tools.length, Icon: Wrench },
          { label: content.outputs, value: outputs.length, Icon: Layers },
        ].map(({ label, value, Icon }) => <div key={label} className="space-y-2 px-4 md:px-6">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</p>
          <p className="text-2xl font-medium tabular-nums">{value}</p>
        </div>)}
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{content.goal}</h2>
        <p className="rounded-xl bg-[var(--message-user-bg)] px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words">{model.goal?.content ?? content.emptyGoal}</p>
      </section>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold">{content.conclusion}</h2>
          {model.reply === undefined
            ? <p className="text-sm leading-6 text-muted-foreground">{model.active ? content.awaitingConclusion : content.emptyConclusion}</p>
            : <div className="rounded-xl border border-border p-4"><div className="max-h-80 overflow-y-auto pr-1"><MessageMarkdown text={model.reply.content} /></div><Button asChild variant="ghost" size="sm" className="mt-3"><Link to={conversation}>{content.fullConversation}<ArrowRight className="size-3.5" /></Link></Button></div>}
        </section>
        <section className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{content.progress}</h2><Button asChild variant="ghost" size="sm" className="h-6 px-1 text-xs"><Link to={trace}>{content.trace}<ArrowRight className="size-3" /></Link></Button></div>
          {model.todo !== undefined && <TodoItems items={parseTodos(model.todo)} />}
          {model.tools.length === 0 && <p className="text-sm text-muted-foreground">{content.emptyProgress}</p>}
          <ol className="space-y-3">
            {model.tools.slice(-5).map((tool) => <li key={tool.id} className="flex items-start gap-2 text-xs">
              <Wrench className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p>{toolLabel(tool.name)}</p><p className="mt-1 truncate text-muted-foreground" title={toolTarget(tool.arguments)?.text}>{toolTarget(tool.arguments)?.text}</p></div>
              <span className={`shrink-0 ${tool.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{zhCN.conversation.tools.status[tool.status]}</span>
            </li>)}
          </ol>
          {analysis.jobs.data?.filter((job) => job.state === "failed" || job.state === "submission_unknown").map((job) => <p key={job.id} role="alert" className="text-xs leading-5 text-destructive">{zhCN.analysis.states[job.state]}{job.error_message !== null && ` · ${job.error_message}`}</p>)}
        </section>
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{content.results}</h2><Button asChild variant="ghost" size="sm"><Link to={sessionMapPath(session.workspace_id, session.id)}><Map className="size-3.5" />{content.map}</Link></Button></div>
        {outputs.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{content.emptyResults}</p>
          : <div className="grid gap-6 md:grid-cols-2">{outputs.map((output) => <OutputCard key={output.id} output={output} workspaceId={session.workspace_id} />)}</div>}
      </section>
    </main>
  </div>;
}
