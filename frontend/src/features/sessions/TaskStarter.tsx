import { ArrowUpRight, Layers, MapPinned, Satellite } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { ConnectionReadiness } from "@/features/workspaces/ConnectionReadiness";
import { productCopy as copy } from "@/locales/zh-CN/product";

const icons = [Satellite, MapPinned, Layers];
export function TaskStarter() {
  const { draft, changeDraft } = useSessionMessages();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [region, setRegion] = useState("");
  const [period, setPeriod] = useState("");
  const task = copy.tasks.find((item) => item.id === taskId);
  return (
    <section className="mx-auto w-full max-w-[880px] px-6 py-10">
      <p className="text-xs font-medium text-primary">Kunyu · GeoAgent</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {copy.startTitle}
      </h1>
      <p className="mt-3 mb-6 text-sm leading-6 text-muted-foreground">
        {copy.startHint}
      </p>
      <div className="mb-5 grid gap-3 @min-[600px]:grid-cols-3">
        {copy.tasks.map((item, index) => {
          const Icon = icons[index]!;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={taskId === item.id}
              className="rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/5 disabled:opacity-50"
              disabled={draft.trim().length > 0}
              onClick={() => setTaskId(item.id)}
            >
              <Icon className="mb-3 size-5 text-primary" />
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                {item.description}
              </span>
            </button>
          );
        })}
      </div>
      {draft.trim().length > 0 && (
        <p className="mb-4 text-xs text-muted-foreground">{copy.draftExists}</p>
      )}
      {task !== undefined && draft.trim().length === 0 && (
        <form
          className="mb-5 space-y-4 rounded-xl border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            changeDraft(
              copy.taskDraft(task.prompt, region.trim(), period.trim()),
            );
            setTaskId(null);
          }}
        >
          <div className="grid gap-4 @min-[600px]:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>{copy.region}</span>
              <Input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder={copy.regionPlaceholder}
                required
                maxLength={300}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>{copy.period}</span>
              <Input
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                placeholder={copy.periodPlaceholder}
                required
                maxLength={300}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{copy.draftHint}</p>
          <Button type="submit" disabled={!region.trim() || !period.trim()}>
            {copy.generateDraft}
            <ArrowUpRight className="size-4" />
          </Button>
        </form>
      )}
      <ConnectionReadiness remote={task?.remote !== false} />
    </section>
  );
}
