import { Fragment } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SkillPreview } from "./SkillPreview";
import { skillTextParts, type LoadedSkill } from "./session-skills";

export function UserSkillText({ text, skills }: {
  readonly text: string;
  readonly skills: ReadonlyMap<string, LoadedSkill>;
}) {
  return skillTextParts(text, skills).map((part, index) => (
    "skill" in part ? (
      <Popover key={index}>
        <PopoverTrigger asChild>
          <button type="button" data-ref-chip="skill" className="mx-0.5 inline cursor-pointer font-mono font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" title={part.skill.name} onClick={(event) => {
            if (event.detail > 1 || window.getSelection()?.toString()) event.preventDefault();
          }}>
            {part.text}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[420px] whitespace-normal">
          <SkillPreview skill={part.skill} />
        </PopoverContent>
      </Popover>
    ) : <Fragment key={index}>{part.text}</Fragment>
  ));
}
