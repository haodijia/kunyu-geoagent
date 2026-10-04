import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { useAppUiStore } from "@/app/store";
import { agentQueryKeys } from "@/features/agent/api";
import { messageQueryKeys } from "@/features/messages/api";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { parseComposerCommand, type ComposerCommandDescriptor } from "./commands";
import { composerCommandsApi, type CommandMessage } from "./api";
import type { ModelPickerPane } from "./ComposerModelPicker";

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

export function useComposerCommands({
  draft, locked, modelDisabled, agentBusy, message, sendDisabled, sendSkill, changeDraft, openModelPicker,
}: ComposerCommandOptions) {
  const session = useSessionWorkspace();
  const clearComposerDraft = useAppUiStore((state) => state.clearComposerDraft);
  const queryClient = useQueryClient();
  const executingRef = useRef(false);
  const frozenRef = useRef<{ id: string; line: string; message: CommandMessage | null } | null>(null);
  const currentDraftRef = useRef(draft);
  currentDraftRef.current = draft;
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const content = zhCN.conversation.commands;
  const catalog = useQuery({
    queryKey: ["sessions", session.id, "commands"],
    queryFn: () => composerCommandsApi.list(session.id),
    enabled: !session.archived,
    staleTime: 0,
  });
  const commands: ComposerCommandDescriptor[] = [
    { definition_id: "kunyu/ui-model-selection", name: "model", description: content.modelDescription, input_hint: null, kind: "model", unavailableReason: modelDisabled ? content.modelLocked : null },
    ...(catalog.data === undefined ? [] : catalog.data.map((item) => ({
      ...item,
      unavailableReason: item.kind === "skill" && sendDisabled ? content.skillUnavailable : item.name === "compact" && agentBusy ? content.agentBusy : null,
    }))),
  ];

  async function execute(line: string) {
    if (locked || executingRef.current) return;
    setFeedback(null);
    const parsed = parseComposerCommand(line);
    const command = commands.find((item) => item.name === parsed?.name);
    if (command?.kind !== "model" && (catalog.isPending || catalog.isError)) {
      setFeedback({ kind: "error", text: catalog.isPending ? content.loading : content.loadFailed });
      return;
    }
    if (parsed === null || command === undefined) {
      setFeedback({ kind: "error", text: content.unknown });
      return;
    }
    if ((command.input_hint === null && parsed.rawInput !== "") || command.unavailableReason !== null) {
      setFeedback({ kind: "error", text: command.unavailableReason ?? content.noArguments });
      return;
    }
    if (command.kind === "skill") {
      sendSkill();
      return;
    }
    if (command.kind === "model") {
      openModelPicker("model");
      changeDraft("");
      return;
    }
    executingRef.current = true;
    setPending(true);
    const submittedDraft = currentDraftRef.current;
    const frozen = frozenRef.current;
    const request = frozen !== null && frozen.line === line ? frozen : { id: crypto.randomUUID(), line, message };
    frozenRef.current = request;
    try {
      const result = await composerCommandsApi.execute(session.id, request.id, request.line, request.message);
      frozenRef.current = null;
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
      if (currentDraftRef.current === submittedDraft) {
        if (command.name === "plan" && parsed.rawInput.trim() !== "" && parsed.rawInput.trim() !== "off") clearComposerDraft(session.id);
        else changeDraft("");
      }
      setFeedback(result);
    } catch (error) {
      console.error("[commands] Failed to execute Agent command.", { sessionId: session.id, command: command.name, error });
      if (error instanceof ApiError && error.status < 500) frozenRef.current = null;
      setFeedback({ kind: "error", text: content.failed });
    } finally {
      executingRef.current = false;
      setPending(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(session.id) }),
        queryClient.invalidateQueries({ queryKey: agentQueryKeys.session(session.id) }),
      ]);
    }
  }

  return {
    commands, execute, pending, feedback,
    catalogError: catalog.isError ? content.loadFailed : null,
    catalogPending: catalog.isPending,
    resetFeedback: () => setFeedback(null),
  };
}
