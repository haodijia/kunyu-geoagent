import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { ConnectionReadiness } from "@/features/workspaces/ConnectionReadiness";
import { refSetter } from "@/lib/lifecycle";
import { productCopy as copy } from "@/locales/zh-CN/product";
import { ArrowUpRight, Layers, MapPinned, Satellite } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
const icons = [Satellite, MapPinned, Layers];
export const TaskStarter = defineComponent(
  (_props, { slots: _slots }) => {
    const { draft, changeDraft } = toRefs(useSessionMessages());
    const taskId = shallowRef<string | null>(null),
      setTaskId = refSetter(taskId);
    const region = shallowRef(""),
      setRegion = refSetter(region);
    const period = shallowRef(""),
      setPeriod = refSetter(period);
    const task = computed(() =>
      copy.tasks.find((item) => item.id === taskId.value),
    );
    return () => {
      const _task = task.value;
      return (
        <section class="mx-auto w-full max-w-[880px] px-6 py-10">
          <p class="text-xs font-medium text-primary">Kunyu · GeoAgent</p>
          <h1 class="mt-3 text-2xl font-semibold tracking-tight">
            {copy.startTitle}
          </h1>
          <p class="mt-3 mb-6 text-sm leading-6 text-muted-foreground">
            {copy.startHint}
          </p>
          <div class="mb-5 grid gap-3 @min-[600px]:grid-cols-3">
            {copy.tasks.map((item, index) => {
              const Icon = icons[index]!;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={taskId.value === item.id}
                  class="rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/5 disabled:opacity-50"
                  disabled={draft.value.trim().length > 0}
                  onClick={() => setTaskId(item.id)}
                >
                  <Icon class="mb-3 size-5 text-primary" />
                  <span class="block text-sm font-medium">{item.title}</span>
                  <span class="mt-2 block text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
          {draft.value.trim().length > 0 && (
            <p class="mb-4 text-xs text-muted-foreground">{copy.draftExists}</p>
          )}
          {_task !== undefined && draft.value.trim().length === 0 && (
            <form
              class="mb-5 space-y-4 rounded-xl border p-5"
              onSubmit={(event) => {
                event.preventDefault();
                changeDraft.value(
                  copy.taskDraft(
                    _task.prompt,
                    region.value.trim(),
                    period.value.trim(),
                  ),
                );
                setTaskId(null);
              }}
            >
              <div class="grid gap-4 @min-[600px]:grid-cols-2">
                <label class="space-y-2 text-sm">
                  <span>{copy.region}</span>
                  <Input
                    value={region.value}
                    onInput={(event) =>
                      setRegion((event.target as HTMLInputElement).value)
                    }
                    placeholder={copy.regionPlaceholder}
                    required
                    maxlength={300}
                  />
                </label>
                <label class="space-y-2 text-sm">
                  <span>{copy.period}</span>
                  <Input
                    value={period.value}
                    onInput={(event) =>
                      setPeriod((event.target as HTMLInputElement).value)
                    }
                    placeholder={copy.periodPlaceholder}
                    required
                    maxlength={300}
                  />
                </label>
              </div>
              <p class="text-xs text-muted-foreground">{copy.draftHint}</p>
              <Button
                type="submit"
                disabled={!region.value.trim() || !period.value.trim()}
              >
                {copy.generateDraft}
                <ArrowUpRight class="size-4" />
              </Button>
            </form>
          )}
          <ConnectionReadiness remote={_task?.remote !== false} />
        </section>
      );
    };
  },
  {
    name: "TaskStarter",
    inheritAttrs: false,
    props: [],
  },
);
