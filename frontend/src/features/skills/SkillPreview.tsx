import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import type { LoadedSkill } from "@/features/skills/session-skills";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent } from "vue";
export const SkillPreview = defineComponent(
  (
    componentProps: {
      readonly skill: LoadedSkill;
    },
    { slots: _slots },
  ) => {
    const skill = computed(() => componentProps.skill);
    return () => {
      const _skill = skill.value;
      return (
        <div class="min-w-0" data-skill-preview={_skill.name}>
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="truncate text-[13px] font-medium">{_skill.name}</span>
            <CopyButton text={_skill.content} />
          </div>
          <p class="mb-2 text-xs text-muted-foreground">
            {zhCN.skills.loadedSnapshot} · {_skill.source}
          </p>
          <div class="max-h-[min(50vh,360px)] overflow-auto rounded-md bg-muted p-2 text-xs leading-relaxed [overflow-wrap:anywhere]">
            <MessageMarkdown text={_skill.content} />
          </div>
        </div>
      );
    };
  },
  {
    name: "SkillPreview",
    inheritAttrs: false,
    props: ["skill"],
  },
);
