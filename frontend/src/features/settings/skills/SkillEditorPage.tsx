import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import {
  skillQueryKeys,
  skillsApi,
  type SkillDetail,
} from "@/features/skills/api";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.skills;

export function SkillEditorPage() {
  const { skillName } = useParams();
  const detail = useQuery({
    queryKey: skillQueryKeys.detail(skillName ?? ""),
    queryFn: () => {
      if (skillName === undefined) throw new Error("A skill name is required.");
      return skillsApi.detail(skillName);
    },
    enabled: skillName !== undefined,
  });
  if (skillName === undefined) return <SkillEditor key="new" detail={null} />;
  if (detail.isPending)
    return (
      <SettingsPageWrapper>
        <p className="text-sm text-muted-foreground">{content.loading}</p>
      </SettingsPageWrapper>
    );
  if (detail.isError)
    return (
      <SettingsPageWrapper>
        <Link to="/settings/skills">{content.back}</Link>
        <p className="text-sm text-destructive" role="alert">
          {detail.error.message}
        </p>
      </SettingsPageWrapper>
    );
  return <SkillEditor key={detail.data.name} detail={detail.data} />;
}

function SkillEditor({ detail }: { readonly detail: SkillDetail | null }) {
  const create = detail === null;
  const editable = create || detail.editable;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(detail?.name ?? "my-skill");
  const [raw, setRaw] = useState(() => {
    if (detail === null) return content.template("my-skill");
    if (!detail.editable) return "";
    if (detail.raw === null)
      throw new Error("An editable skill requires its source text.");
    return detail.raw;
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const save = useMutation({
    mutationFn: () => skillsApi.save(name, raw, create),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: skillQueryKeys.all });
      toast.success(content.saved);
      void navigate("/settings/skills");
    },
    onError: (error) => console.error("[skills] Save failed.", error),
  });
  const remove = useMutation({
    mutationFn: () => skillsApi.delete(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: skillQueryKeys.all });
      toast.success(content.deleted);
      void navigate("/settings/skills");
    },
    onError: (error) => console.error("[skills] Delete failed.", error),
  });
  const busy = save.isPending || remove.isPending;
  const error = save.error ?? remove.error;
  const resourceBase = detail?.resource_base;
  const resourceLocation =
    resourceBase == null
      ? null
      : resourceBase.kind === "directory"
        ? resourceBase.path
        : resourceBase.kind === "url"
          ? resourceBase.url
          : resourceBase.description;

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={create ? content.create : name}
        description={
          editable ? content.editorDescription : content.viewDescription
        }
        navigation={
          <Link
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            to="/settings/skills"
          >
            <ArrowLeft className="size-3.5" />
            {content.back}
          </Link>
        }
        actions={
          detail?.editable ? (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {content.delete}
            </Button>
          ) : null
        }
      />
      <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
        {create ? (
          <label className="flex flex-col gap-2 text-[13px]">
            <span className="font-medium">{content.name}</span>
            <Input
              value={name}
              disabled={busy}
              maxLength={200}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                setRaw((current) =>
                  current.replace(/^name:.*$/m, `name: ${value}`),
                );
              }}
            />
            <span className="text-xs text-muted-foreground">
              {content.nameHelp}
            </span>
          </label>
        ) : (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {detail.when_to_use !== null && (
              <span>
                {content.whenToUse} · {detail.when_to_use}
              </span>
            )}
            {detail.path !== null && (
              <span>
                {content.file} · {detail.path}
              </span>
            )}
            {resourceBase != null && (
              <span>
                {content.resourceKinds[resourceBase.kind]} · {resourceLocation}
              </span>
            )}
            <span>
              {content.provider} ·{" "}
              {content.sources[detail.source as keyof typeof content.sources] ??
                detail.source}
            </span>
            {!editable ? <span>{content.readOnly}</span> : null}
          </div>
        )}
        {!editable && detail !== null ? (
          <section className="settings-group" data-skill-instructions={name}>
            <h2 className="settings-group__title">{content.instructions}</h2>
            <MessageMarkdown text={detail.content} />
          </section>
        ) : (
          <label className="flex flex-col gap-2 text-[13px]">
            <span className="font-medium">SKILL.md</span>
            <Textarea
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              readOnly={!editable}
              disabled={busy}
              rows={20}
              className="min-h-96 font-mono text-xs leading-5"
              spellCheck={false}
              required
            />
          </label>
        )}
        {editable && (
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            {content.policyHelp}
          </p>
        )}
        {error ? (
          <p className="m-0 text-xs text-destructive" role="alert">
            {error.message}
          </p>
        ) : null}
        {editable ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !name || !raw.trim()}>
              {save.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {content.save}
            </Button>
          </div>
        ) : null}
      </form>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{content.deleteTitle(name)}</AlertDialogTitle>
          <AlertDialogDescription>
            {content.deleteDescription}
          </AlertDialogDescription>
          {remove.isError ? (
            <p className="text-xs text-destructive" role="alert">
              {remove.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="ghost" disabled={busy}>
                {content.cancel}
              </Button>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {content.delete}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageWrapper>
  );
}
