import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { sessionAnalysisPath, sessionMapPath } from "@/features/sessions/routes";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { parseComposerCommand, type ComposerCommandDescriptor, type ComposerCommandName } from "./commands";
import type { ModelPickerPane } from "./ComposerModelPicker";

interface ComposerCommandOptions {
  readonly commands: readonly ComposerCommandDescriptor[];
  readonly draft: string;
  readonly locked: boolean;
  readonly changeDraft: (draft: string) => void;
  readonly openModelPicker: (pane: ModelPickerPane) => void;
  readonly stop: () => Promise<unknown>;
}

export function useComposerCommands({
  commands, draft, locked, changeDraft, openModelPicker, stop,
}: ComposerCommandOptions) {
  const session = useSessionWorkspace();
  const navigate = useNavigate();
  const executingRef = useRef(false);
  const currentDraftRef = useRef(draft);
  currentDraftRef.current = draft;
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const content = zhCN.conversation.commands;

  const handlers: Record<ComposerCommandName, () => void | Promise<unknown>> = {
    model: () => openModelPicker("model"),
    effort: () => openModelPicker("effort"),
    stop,
    map: () => navigate(sessionMapPath(session.workspace_id, session.id)),
    trace: () => navigate(sessionAnalysisPath(session.workspace_id, session.id, "trace")),
    settings: () => navigate("/settings/models"),
    help: () => setFeedback({ kind: "success", text: content.help }),
  };

  async function execute(line: string) {
    if (locked || executingRef.current) return;
    setFeedback(null);
    const parsed = parseComposerCommand(line);
    const command = commands.find((item) => item.name === parsed?.name);
    if (parsed === null || command === undefined) {
      setFeedback({ kind: "error", text: content.unknown });
      return;
    }
    if (parsed.rawInput !== "" || command.unavailableReason !== null) {
      setFeedback({ kind: "error", text: command.unavailableReason ?? content.noArguments });
      return;
    }
    executingRef.current = true;
    setPending(true);
    const submittedDraft = currentDraftRef.current;
    try {
      await handlers[command.name]();
      if (currentDraftRef.current === submittedDraft) changeDraft("");
      if (command.name === "stop") {
        setFeedback({ kind: "success", text: content.stopped });
      }
    } catch (error) {
      console.error("[commands] Failed to execute composer command.", {
        sessionId: session.id, command: command.name, error,
      });
      setFeedback({ kind: "error", text: content.failed });
    } finally {
      executingRef.current = false;
      setPending(false);
    }
  }

  return { execute, pending, feedback, resetFeedback: () => setFeedback(null) };
}
