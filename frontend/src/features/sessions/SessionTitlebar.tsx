import { FolderClosed } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ConversationSkillsIndicator } from "@/features/skills/ConversationSkillsIndicator";
import { SessionModeSwitcher } from "@/features/sessions/SessionModeSwitcher";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { FileExplorerToggle } from "@/features/files/FileExplorer";

interface TitlebarTargets {
  readonly mode: HTMLElement;
  readonly title: HTMLElement;
  readonly actions: HTMLElement;
}

export function SessionTitlebar() {
  const session = useSessionWorkspace();
  const [targets, setTargets] = useState<TitlebarTargets | null>(null);

  useEffect(() => {
    const title = document.getElementById("session-titlebar-title-slot");
    const mode = document.getElementById("session-titlebar-mode-slot");
    const actions = document.getElementById("session-titlebar-actions-slot");
    if (title === null || mode === null || actions === null) {
      throw new Error("Session titlebar slots are required.");
    }
    setTargets({ mode, title, actions });
  }, []);

  if (targets === null) {
    return null;
  }

  return (
    <>
      {createPortal(
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <FolderClosed className="size-4 shrink-0" strokeWidth={1.8} />
          <span className="truncate">{session.title}</span>
          <ConversationSkillsIndicator />
        </div>,
        targets.title
      )}
      {createPortal(<SessionModeSwitcher />, targets.mode)}
      {createPortal(<FileExplorerToggle />, targets.actions)}
    </>
  );
}
