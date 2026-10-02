import { useQuery } from "@tanstack/react-query";
import { ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { zhCN } from "@/locales/zh-CN";
import { skillQueryKeys, skillsApi } from "./api";

const content = zhCN.skills;

export function SkillPicker({ sessionId, draft, disabled, onDraftChange }: {
  readonly sessionId: string;
  readonly draft: string;
  readonly disabled: boolean;
  readonly onDraftChange: (draft: string) => void;
}) {
  const skills = useQuery({
    queryKey: skillQueryKeys.session(sessionId),
    queryFn: () => skillsApi.session(sessionId),
    staleTime: 0,
  });
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void skills.refetch(); }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="composer-chip" disabled={disabled} aria-label={content.select}>
          <Sparkles size={13} /><span>{content.title}</span><ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="max-h-80 w-72 overflow-y-auto">
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{content.invokeHelp}</div>
        {skills.isPending ? <div className="flex gap-2 px-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />{content.loading}</div> : null}
        {skills.isError ? <div className="px-2 py-2 text-xs text-destructive" role="alert">{skills.error.message}</div> : null}
        {skills.data?.length === 0 ? <div className="px-2 py-2 text-xs text-muted-foreground">{content.empty}</div> : null}
        {skills.data?.map((skill) => (
          <DropdownMenuItem key={skill.name} className="items-start" onSelect={() => {
            const text = draft.replace(/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\s+|$)/, "");
            onDraftChange(`/${skill.name} ${text}`);
          }}>
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0"><span className="block text-xs font-medium">/{skill.name}</span>
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">{skill.description}</span></span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild><Link to="/settings/skills">{content.manage}</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
