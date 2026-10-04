import { Zap, ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { zhCN } from "@/locales/zh-CN";
import { SkillPreview } from "./SkillPreview";
import { collectSessionSkills, type LoadedSkill } from "./session-skills";

const copy = zhCN.skills;

export function ConversationSkillsIndicator() {
  const { events } = useSessionEvents();
  const { loaded } = useMemo(() => collectSessionSkills(events), [events]);
  const [selected, setSelected] = useState<LoadedSkill | null>(null);
  if (loaded.size === 0) return null;
  return (
    <Popover onOpenChange={() => setSelected(null)}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="skills-indicator" className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[13px] leading-none text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={copy.loadedCount(loaded.size)}>
          <Zap className="size-3.5 fill-primary text-primary" strokeWidth={2} aria-hidden="true" />
          <span data-testid="skills-indicator-count">{loaded.size}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={selected === null ? "w-80" : "w-[420px]"}>
        {selected === null ? (
          <div className="max-h-[300px] overflow-y-auto">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{copy.loadedCount(loaded.size)}</p>
            <div className="flex flex-col gap-1">
              {[...loaded.values()].map((skill) => (
                <button key={skill.name} type="button" className="truncate rounded px-2 py-1 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => setSelected(skill)}>{skill.name}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(null)}><ArrowLeft className="size-3" />{copy.loadedList}</button>
            <SkillPreview skill={selected} />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
