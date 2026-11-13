import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SkillPreview } from "@/features/skills/SkillPreview";
import {
  skillTextParts,
  type LoadedSkill,
} from "@/features/skills/session-skills";
import { referenceParts } from "@/features/workspaces/references";
import { Fragment, computed, defineComponent } from "vue";
export const UserSkillText = defineComponent(
  (
    componentProps: {
      readonly text: string;
      readonly skills: ReadonlyMap<string, LoadedSkill>;
    },
    { slots: _slots },
  ) => {
    const text = computed(() => componentProps.text),
      skills = computed(() => componentProps.skills);
    return () => {
      const _text = text.value,
        _skills = skills.value;
      return skillTextParts(_text, _skills).map((part, index) =>
        "skill" in part ? (
          <Popover key={index}>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-ref-chip="skill"
                class="mx-0.5 inline cursor-pointer font-mono font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                title={part.skill.name}
                onClick={(event) => {
                  if (event.detail > 1 || window.getSelection()?.toString())
                    event.preventDefault();
                }}
              >
                {part.text}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" class="w-[420px] whitespace-normal">
              <SkillPreview skill={part.skill} />
            </PopoverContent>
          </Popover>
        ) : (
          <Fragment key={index}>
            {referenceParts(part.text).map((reference, position) =>
              reference.target === undefined ? (
                <Fragment key={position}>{reference.text}</Fragment>
              ) : (
                <span
                  key={position}
                  data-ref-chip="workspace"
                  title={reference.target}
                  class="mx-0.5 rounded bg-muted px-1 font-medium text-primary"
                >
                  {reference.text}
                </span>
              ),
            )}
          </Fragment>
        ),
      );
    };
  },
  {
    name: "UserSkillText",
    inheritAttrs: false,
    props: ["text", "skills"],
  },
);
