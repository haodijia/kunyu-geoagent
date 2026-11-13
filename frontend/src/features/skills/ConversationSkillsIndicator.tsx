import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { SkillPreview } from "@/features/skills/SkillPreview";
import {
  collectSessionSkills,
  type LoadedSkill,
} from "@/features/skills/session-skills";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ArrowLeft, Zap } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
const copy = zhCN.skills;
export const ConversationSkillsIndicator = defineComponent(
  (_props, { slots: _slots }) => {
    const { events } = toRefs(useSessionEvents());
    const registry = computed(() => collectSessionSkills(events.value));
    const selected = shallowRef<LoadedSkill | null>(null),
      setSelected = refSetter(selected);
    return () => {
      if (registry.value.loaded.size === 0) return null;
      return (
        <Popover onUpdate:open={() => setSelected(null)}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid="skills-indicator"
              class="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[13px] leading-none text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={copy.loadedCount(registry.value.loaded.size)}
            >
              <Zap
                class="size-3.5 fill-primary text-primary"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span data-testid="skills-indicator-count">
                {registry.value.loaded.size}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            class={selected.value === null ? "w-80" : "w-[420px]"}
          >
            {selected.value === null ? (
              <div class="max-h-[300px] overflow-y-auto">
                <p class="mb-2 text-xs font-medium text-muted-foreground">
                  {copy.loadedCount(registry.value.loaded.size)}
                </p>
                <div class="flex flex-col gap-1">
                  {[...registry.value.loaded.values()].map((skill) => (
                    <button
                      key={skill.name}
                      type="button"
                      class="truncate rounded px-2 py-1 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => setSelected(skill)}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  class="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft class="size-3" />
                  {copy.loadedList}
                </button>
                <SkillPreview skill={selected.value} />
              </>
            )}
          </PopoverContent>
        </Popover>
      );
    };
  },
  {
    name: "ConversationSkillsIndicator",
    inheritAttrs: false,
    props: [],
  },
);
