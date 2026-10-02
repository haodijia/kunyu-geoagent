import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, LoaderCircle, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { skillQueryKeys, skillsApi } from "@/features/skills/api";
import { zhCN } from "@/locales/zh-CN";
import { SettingsPageHeader, SettingsPageWrapper } from "../SettingsPage";

const content = zhCN.skills;

export function SkillsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [path, setPath] = useState("");
  const catalog = useQuery({ queryKey: skillQueryKeys.catalog, queryFn: skillsApi.list });
  const importSkill = useMutation({
    mutationFn: () => skillsApi.import(path.trim()),
    onSuccess: async (skill) => {
      await queryClient.invalidateQueries({ queryKey: skillQueryKeys.all });
      toast.success(content.imported);
      void navigate(`/settings/skills/view/${encodeURIComponent(skill.name)}`);
    },
    onError: (error) => console.error("[skills] Import failed.", error),
  });
  const skills = catalog.data?.skills.filter((skill) =>
    `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader title={content.title} description={content.description} actions={
        <>
          <Button variant="ghost" size="icon" aria-label={content.refresh} disabled={catalog.isFetching}
            onClick={() => void catalog.refetch()}>
            <RefreshCw className={`size-4 ${catalog.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={() => setImportOpen((value) => !value)}>
            <Download className="size-4" />{content.import}
          </Button>
          <Button asChild><Link to="/settings/skills/new"><Plus className="size-4" />{content.create}</Link></Button>
        </>
      } />
      {importOpen ? (
        <form className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          onSubmit={(event) => { event.preventDefault(); importSkill.mutate(); }}>
          <label className="flex flex-col gap-2 text-[13px]">
            <span className="font-medium">{content.importPath}</span>
            <Input value={path} onChange={(event) => setPath(event.target.value)}
              placeholder={content.importPlaceholder} disabled={importSkill.isPending} />
          </label>
          <p className="m-0 text-xs leading-5 text-muted-foreground">{content.importHelp}</p>
          {importSkill.isError ? <p className="m-0 text-xs text-destructive" role="alert">{importSkill.error.message}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={!path.trim() || importSkill.isPending}>
              {importSkill.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}{content.import}
            </Button>
          </div>
        </form>
      ) : null}
      <div className="my-6 flex flex-col gap-2">
        <Input aria-label={content.search} placeholder={content.search} value={search} onChange={(event) => setSearch(event.target.value)} />
        {catalog.data ? <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{content.directory} · {catalog.data.directory}</p> : null}
      </div>
      {catalog.isPending ? <p className="text-sm text-muted-foreground">{content.loading}</p> : null}
      {catalog.isError ? <p className="text-sm text-destructive" role="alert">{catalog.error.message}</p> : null}
      {skills?.length === 0 ? <p className="text-sm text-muted-foreground">{content.empty}</p> : null}
      <div className="settings-list">
        {skills?.map((skill) => (
          <Link key={skill.name} to={`/settings/skills/view/${encodeURIComponent(skill.name)}`}
            className="flex min-w-0 items-center gap-3 py-4 text-foreground no-underline transition-colors hover:bg-muted/50">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Sparkles className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{skill.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{content.sources[skill.source as keyof typeof content.sources] ?? skill.source}</span>
                {!skill.model_invocable ? <span className="text-[11px] text-muted-foreground">{content.modelDisabled}</span> : null}
                {!skill.user_invocable ? <span className="text-[11px] text-muted-foreground">{content.userDisabled}</span> : null}
              </div>
              <p className="m-0 mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{skill.description}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </SettingsPageWrapper>
  );
}
