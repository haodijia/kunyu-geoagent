import { ApiError } from "@/api/client";
import { useAppUiStore } from "@/app/store";
import { agentQueryKeys } from "@/features/agent/api";
import { messageQueryKeys } from "@/features/messages/api";
import {
  composerCommandsApi,
  type CommandMessage,
} from "@/features/messages/composer/api";
import {
  parseComposerCommand,
  type ComposerCommandDescriptor,
} from "@/features/messages/composer/commands";
import type { ModelPickerPane } from "@/features/messages/composer/ComposerModelPicker";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  computed,
  reactive,
  shallowReactive,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
interface ComposerCommandOptions {
  readonly draft: string;
  readonly locked: boolean;
  readonly modelDisabled: boolean;
  readonly agentBusy: boolean;
  readonly message: CommandMessage | null;
  readonly sendDisabled: boolean;
  readonly sendSkill: () => void;
  readonly changeDraft: (draft: string) => void;
  readonly openModelPicker: (pane: ModelPickerPane) => void;
}
export function useComposerCommands(
  source: MaybeRefOrGetter<ComposerCommandOptions>,
) {
  const draft = computed(() => toValue(source).draft),
    locked = computed(() => toValue(source).locked),
    modelDisabled = computed(() => toValue(source).modelDisabled),
    agentBusy = computed(() => toValue(source).agentBusy),
    message = computed(() => toValue(source).message),
    sendDisabled = computed(() => toValue(source).sendDisabled),
    sendSkill = computed(() => toValue(source).sendSkill),
    changeDraft = computed(() => toValue(source).changeDraft),
    openModelPicker = computed(() => toValue(source).openModelPicker);
  const session = useSessionWorkspace();
  const clearComposerDraft = computed(() =>
    ((state) => state.clearComposerDraft)(useAppUiStore()),
  );
  const queryClient = useQueryClient();
  const executingRef = shallowRef(false);
  const frozenRef = shallowRef<{
    id: string;
    line: string;
    message: CommandMessage | null;
  } | null>(null);
  const currentDraftRef = shallowRef(draft.value);
  currentDraftRef.value = draft.value;
  const pending = shallowRef(false),
    setPending = refSetter(pending);
  const feedback = shallowRef<{
      kind: "success" | "error";
      text: string;
    } | null>(null),
    setFeedback = refSetter(feedback);
  const content = zhCN.conversation.commands;
  const catalog = reactive(
    useQuery(
      computed(() => ({
        queryKey: ["sessions", session.id, "commands"],
        queryFn: () => composerCommandsApi.list(session.id),
        enabled: !session.archived,
        staleTime: 0,
      })),
    ),
  );
  const commands = computed<ComposerCommandDescriptor[]>(() => [
    {
      definition_id: "kunyu/ui-model-selection",
      name: "model",
      description: content.modelDescription,
      when_to_use: null,
      input_hint: null,
      kind: "model",
      unavailableReason: modelDisabled.value ? content.modelLocked : null,
    },
    ...(catalog.data === undefined
      ? []
      : catalog.data.map((item) => ({
          ...item,
          unavailableReason:
            item.kind === "skill" && sendDisabled.value
              ? content.skillUnavailable
              : item.name === "compact" && agentBusy.value
                ? content.agentBusy
                : null,
        }))),
  ]);
  async function execute(
    line: string,
    options: {
      readonly preserveDraft?: boolean;
    } = {},
  ) {
    if (locked.value || executingRef.value) return;
    setFeedback(null);
    const parsed = parseComposerCommand(line);
    const command = commands.value.find((item) => item.name === parsed?.name);
    if (command?.kind !== "model" && (catalog.isPending || catalog.isError)) {
      setFeedback({
        kind: "error",
        text: catalog.isPending ? content.loading : content.loadFailed,
      });
      return;
    }
    if (parsed === null || command === undefined) {
      setFeedback({
        kind: "error",
        text: content.unknown,
      });
      return;
    }
    if (
      (command.input_hint === null && parsed.rawInput !== "") ||
      command.unavailableReason !== null
    ) {
      setFeedback({
        kind: "error",
        text: command.unavailableReason ?? content.noArguments,
      });
      return;
    }
    if (command.kind === "skill") {
      sendSkill.value();
      return;
    }
    if (command.kind === "model") {
      openModelPicker.value("model");
      changeDraft.value("");
      return;
    }
    executingRef.value = true;
    setPending(true);
    const submittedDraft = currentDraftRef.value;
    const frozen = frozenRef.value;
    const request =
      frozen !== null && frozen.line === line
        ? frozen
        : {
            id: crypto.randomUUID(),
            line,
            message: message.value,
          };
    frozenRef.value = request;
    try {
      const result = await composerCommandsApi.execute(
        session.id,
        request.id,
        request.line,
        request.message,
      );
      frozenRef.value = null;
      if (result.kind === "error") {
        setFeedback(result);
        return;
      }
      if (command.name === "export") {
        const blob = await composerCommandsApi.export(session.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "session-log.zip";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (!options.preserveDraft && currentDraftRef.value === submittedDraft) {
        if (
          command.name === "plan" &&
          parsed.rawInput.trim() !== "" &&
          parsed.rawInput.trim() !== "off"
        )
          clearComposerDraft.value(session.id);
        else changeDraft.value("");
      }
      setFeedback(result);
    } catch (error) {
      console.error("[commands] Failed to execute Agent command.", {
        sessionId: session.id,
        command: command.name,
        error,
      });
      if (error instanceof ApiError && error.status < 500)
        frozenRef.value = null;
      setFeedback({
        kind: "error",
        text: content.failed,
      });
    } finally {
      executingRef.value = false;
      setPending(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: messageQueryKeys.session(session.id),
        }),
        queryClient.invalidateQueries({
          queryKey: agentQueryKeys.session(session.id),
        }),
      ]);
    }
  }
  return shallowReactive({
    get commands() {
      return commands.value;
    },
    get execute() {
      return execute;
    },
    get pending() {
      return pending.value;
    },
    get feedback() {
      return feedback.value;
    },
    get catalogError() {
      return catalog.isError ? content.loadFailed : null;
    },
    get catalogPending() {
      return catalog.isPending;
    },
    get resetFeedback() {
      return () => setFeedback(null);
    },
  });
}
