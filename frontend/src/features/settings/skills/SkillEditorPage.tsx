import { useNavigation } from "@/app/navigation";
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
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { ArrowLeft, LoaderCircle, Save, Trash2 } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { toast } from "vue-sonner";
const content = zhCN.skills;
export const SkillEditorPage = defineComponent(
  (_props, { slots: _slots }) => {
    const _route = useRoute(),
      skillName = computed(() =>
        _route.params.skillName === undefined
          ? undefined
          : String(_route.params.skillName),
      );
    const detail = reactive(
      useQuery(
        computed(() => ({
          queryKey: skillQueryKeys.detail(skillName.value ?? ""),
          queryFn: () => {
            if (skillName.value === undefined)
              throw new Error("A skill name is required.");
            return skillsApi.detail(skillName.value);
          },
          enabled: skillName.value !== undefined,
        })),
      ),
    );
    return () => {
      const _skillName = skillName.value;
      if (_skillName === undefined)
        return <SkillEditor key="new" detail={null} />;
      if (detail.isPending)
        return (
          <SettingsPageWrapper>
            <p class="text-sm text-muted-foreground">{content.loading}</p>
          </SettingsPageWrapper>
        );
      if (detail.isError)
        return (
          <SettingsPageWrapper>
            <RouterLink to="/settings/skills">{content.back}</RouterLink>
            <p class="text-sm text-destructive" role="alert">
              {detail.error.message}
            </p>
          </SettingsPageWrapper>
        );
      return <SkillEditor key={detail.data.name} detail={detail.data} />;
    };
  },
  {
    name: "SkillEditorPage",
    inheritAttrs: false,
    props: [],
  },
);
const SkillEditor = defineComponent(
  (
    componentProps: {
      readonly detail: SkillDetail | null;
    },
    { slots: _slots },
  ) => {
    const detail = computed(() => componentProps.detail);
    const create = computed(() => detail.value === null);
    const editable = computed(
      () => detail.value === null || detail.value.editable,
    );
    const navigate = useNavigation();
    const queryClient = useQueryClient();
    const name = shallowRef(detail.value?.name ?? "my-skill"),
      setName = refSetter(name);
    const raw = shallowRef(
        (() => {
          if (detail.value === null) return content.template("my-skill");
          if (!detail.value.editable) return "";
          if (detail.value.raw === null)
            throw new Error("An editable skill requires its source text.");
          return detail.value.raw;
        })(),
      ),
      setRaw = refSetter(raw);
    const deleteOpen = shallowRef(false),
      setDeleteOpen = refSetter(deleteOpen);
    const save = reactive(
      useMutation({
        mutationFn: () => skillsApi.save(name.value, raw.value, create.value),
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: skillQueryKeys.all,
          });
          toast.success(content.saved);
          void navigate("/settings/skills");
        },
        onError: (error) => console.error("[skills] Save failed.", error),
      }),
    );
    const remove = reactive(
      useMutation({
        mutationFn: () => skillsApi.delete(name.value),
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: skillQueryKeys.all,
          });
          toast.success(content.deleted);
          void navigate("/settings/skills");
        },
        onError: (error) => console.error("[skills] Delete failed.", error),
      }),
    );
    const busy = computed(() => save.isPending || remove.isPending);
    const error = computed(() => save.error ?? remove.error);
    const resourceBase = computed(() => detail.value?.resource_base);
    const resourceLocation = computed(() =>
      resourceBase.value == null
        ? null
        : resourceBase.value.kind === "directory"
          ? resourceBase.value.path
          : resourceBase.value.kind === "url"
            ? resourceBase.value.url
            : resourceBase.value.description,
    );
    function submit(event: SubmitEvent) {
      event.preventDefault();
      save.mutate();
    }
    return () => {
      const _create = create.value,
        _editable = editable.value,
        _detail = detail.value,
        _busy = busy.value,
        _resourceBase = resourceBase.value,
        _resourceLocation = resourceLocation.value,
        _error = error.value;
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={_create ? content.create : name.value}
            description={
              _editable ? content.editorDescription : content.viewDescription
            }
            navigation={
              <RouterLink
                class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                to="/settings/skills"
              >
                <ArrowLeft class="size-3.5" />
                {content.back}
              </RouterLink>
            }
            actions={
              _detail?.editable ? (
                <Button
                  variant="ghost"
                  class="text-destructive"
                  disabled={_busy}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 class="size-4" />
                  {content.delete}
                </Button>
              ) : null
            }
          />
          <form class="mt-6 flex flex-col gap-4" onSubmit={submit}>
            {_create ? (
              <label class="flex flex-col gap-2 text-[13px]">
                <span class="font-medium">{content.name}</span>
                <Input
                  value={name.value}
                  disabled={_busy}
                  maxlength={200}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                  onInput={(event) => {
                    const value = (event.target as HTMLInputElement).value;
                    setName(value);
                    setRaw((current) =>
                      current.replace(/^name:.*$/m, `name: ${value}`),
                    );
                  }}
                />
                <span class="text-xs text-muted-foreground">
                  {content.nameHelp}
                </span>
              </label>
            ) : (
              <div class="flex flex-col gap-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {_detail!.when_to_use !== null && (
                  <span>
                    {content.whenToUse} · {_detail!.when_to_use}
                  </span>
                )}
                {_detail!.path !== null && (
                  <span>
                    {content.file} · {_detail!.path}
                  </span>
                )}
                {_resourceBase != null && (
                  <span>
                    {content.resourceKinds[_resourceBase.kind]} ·{" "}
                    {_resourceLocation}
                  </span>
                )}
                <span>
                  {content.provider} ·{" "}
                  {content.sources[
                    _detail!.source as keyof typeof content.sources
                  ] ?? _detail!.source}
                </span>
                {!_editable ? <span>{content.readonly}</span> : null}
              </div>
            )}
            {!_editable && _detail !== null ? (
              <section
                class="settings-group"
                data-skill-instructions={name.value}
              >
                <h2 class="settings-group__title">{content.instructions}</h2>
                <MessageMarkdown text={_detail!.content} />
              </section>
            ) : (
              <label class="flex flex-col gap-2 text-[13px]">
                <span class="font-medium">SKILL.md</span>
                <Textarea
                  value={raw.value}
                  onInput={(event) =>
                    setRaw((event.target as HTMLInputElement).value)
                  }
                  readonly={!_editable}
                  disabled={_busy}
                  rows={20}
                  class="min-h-96 font-mono text-xs leading-5"
                  spellcheck={false}
                  required
                />
              </label>
            )}
            {_editable && (
              <p class="m-0 text-xs leading-5 text-muted-foreground">
                {content.policyHelp}
              </p>
            )}
            {_error ? (
              <p class="m-0 text-xs text-destructive" role="alert">
                {_error.message}
              </p>
            ) : null}
            {_editable ? (
              <div class="flex justify-end">
                <Button
                  type="submit"
                  disabled={_busy || !name.value || !raw.value.trim()}
                >
                  {save.isPending ? (
                    <LoaderCircle class="size-4 animate-spin" />
                  ) : (
                    <Save class="size-4" />
                  )}
                  {content.save}
                </Button>
              </div>
            ) : null}
          </form>
          <AlertDialog open={deleteOpen.value} onUpdate:open={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogTitle>
                {content.deleteTitle(name.value)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {content.deleteDescription}
              </AlertDialogDescription>
              {remove.isError ? (
                <p class="text-xs text-destructive" role="alert">
                  {remove.error.message}
                </p>
              ) : null}
              <div class="flex justify-end gap-2">
                <AlertDialogCancel asChild>
                  <Button variant="ghost" disabled={_busy}>
                    {content.cancel}
                  </Button>
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={_busy}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? (
                    <LoaderCircle class="size-4 animate-spin" />
                  ) : null}
                  {content.delete}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "SkillEditor",
    inheritAttrs: false,
    props: ["detail"],
  },
);
