import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import type { LoadedSkill } from "./session-skills";

export function SkillPreview({ skill }: { readonly skill: LoadedSkill }) {
  return (
    <div className="min-w-0" data-skill-preview={skill.name}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium">{skill.name}</span>
        <CopyButton text={skill.content} />
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{zhCN.skills.loadedSnapshot} · {skill.source}</p>
      <pre className="m-0 max-h-[min(50vh,360px)] overflow-auto rounded-md bg-muted p-2 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{skill.content}</pre>
    </div>
  );
}
