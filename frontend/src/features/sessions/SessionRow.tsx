import { ApiError } from "@/api/client";
import { useNavigation } from "@/app/navigation";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { Tooltip } from "@/components/ui/tooltip";
import {
  sessionQueryKeys,
  setSessionArchived,
  type SessionSummary,
} from "@/features/sessions/api";
import {
  parseSessionRoute,
  sessionAnalysisPath,
} from "@/features/sessions/routes";
import { workspaceQueryKeys } from "@/features/workspaces/api";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { Archive } from "lucide-vue-next";
import { computed, defineComponent, reactive } from "vue";
import { toast } from "vue-sonner";
const content = zhCN.workspaceSidebar;
export const SessionRow = defineComponent(
  (
    componentProps: {
      readonly session: SessionSummary;
      readonly selected: boolean;
    },
    { slots: _slots },
  ) => {
    const session = computed(() => componentProps.session),
      selected = computed(() => componentProps.selected);
    const navigate = useNavigation();
    const queryClient = useQueryClient();
    const archive = reactive(
      useMutation({
        mutationFn: () => setSessionArchived(session.value.id, true),
        onSuccess: async (updated) => {
          const stored = readLastSessionRoute();
          if (
            stored !== null &&
            parseSessionRoute(stored)?.sessionId === session.value.id
          )
            clearLastSessionRoute();
          queryClient.setQueryData(
            sessionQueryKeys.detail(session.value.id),
            updated,
          );
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.all,
            }),
            queryClient.invalidateQueries({
              queryKey: sessionQueryKeys.archived,
            }),
          ]);
          toast.success(content.archiveSuccess);
        },
        onError: (error) => {
          console.error("[sessions] Archive failed", error);
          toast.error(
            error instanceof ApiError && error.code === "RUN_CONFLICT"
              ? content.archiveRunConflict
              : content.archiveFailed,
          );
        },
      }),
    );
    function openSession() {
      void navigate(
        sessionAnalysisPath(
          session.value.workspace_id,
          session.value.id,
          "conversation",
        ),
      );
    }
    return () => {
      const _session = session.value,
        _selected = selected.value;
      return (
        <Tooltip label={_session.title} side="right">
          <div
            class={cn(
              "chat-history__item group relative flex h-[30px] min-w-0 shrink-0 cursor-pointer items-center justify-start gap-[8px] overflow-hidden rounded-[6px] ps-[32px] pe-[28px] transition-colors",
              _selected ? "bg-fill-3" : "hover:bg-fill-3",
            )}
            role="button"
            tabindex={0}
            aria-label={_session.title}
            aria-current={_selected ? "page" : undefined}
            onClick={openSession}
            onKeydown={(event) => {
              if (
                event.target !== event.currentTarget ||
                (event.key !== "Enter" && event.key !== " ")
              )
                return;
              event.preventDefault();
              openSession();
            }}
          >
            <span class="min-w-0 flex-1 truncate text-[13px] text-t-primary">
              {_session.title}
            </span>
            <Tooltip label={content.archiveSession} side="top">
              <button
                type="button"
                aria-label={content.archiveSession}
                aria-busy={archive.isPending}
                disabled={archive.isPending}
                class="absolute end-[8px] top-1/2 hidden size-[20px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-t-tertiary transition-colors group-hover:flex group-focus-within:flex hover:bg-fill-2 hover:text-t-primary focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-50"
                onClick={(event) => {
                  event.stopPropagation();
                  archive.mutate();
                }}
              >
                <Archive size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        </Tooltip>
      );
    };
  },
  {
    name: "SessionRow",
    inheritAttrs: false,
    props: ["session", "selected"],
  },
);
