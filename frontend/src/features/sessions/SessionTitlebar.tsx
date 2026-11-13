import { ConversationSearch } from "@/features/messages/navigation/ConversationSearch";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { ConversationSkillsIndicator } from "@/features/skills/ConversationSkillsIndicator";
import { WorkspaceViewSwitcher } from "@/features/workspaces/WorkspaceViewSwitcher";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { MessageCircle } from "lucide-vue-next";
import { defineComponent, shallowRef, Teleport } from "vue";
interface TitlebarTargets {
  readonly mode: HTMLElement;
  readonly title: HTMLElement;
}
export const SessionTitlebar = defineComponent(
  (_props, { slots: _slots }) => {
    const session = useSessionWorkspace();
    const targets = shallowRef<TitlebarTargets | null>(null),
      setTargets = refSetter(targets);
    watchMounted([], () => {
      const title = document.getElementById("session-titlebar-title-slot");
      const mode = document.getElementById("session-titlebar-mode-slot");
      if (title === null || mode === null) {
        throw new Error("Session titlebar slots are required.");
      }
      setTargets({
        mode,
        title,
      });
    });
    return () => {
      if (targets.value === null) {
        return null;
      }
      return (
        <>
          {
            <Teleport to={targets.value.title}>
              {
                <div class="pointer-events-auto flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">
                  <MessageCircle
                    class="size-[18px] shrink-0"
                    strokeWidth={1.8}
                  />
                  <span class="truncate">{session.title}</span>
                  <ConversationSearch />
                  <ConversationSkillsIndicator />
                </div>
              }
            </Teleport>
          }
          {
            <Teleport to={targets.value.mode}>
              {
                <WorkspaceViewSwitcher
                  workspaceId={session.workspace_id}
                  sessionId={session.id}
                />
              }
            </Teleport>
          }
        </>
      );
    };
  },
  {
    name: "SessionTitlebar",
    inheritAttrs: false,
    props: [],
  },
);
