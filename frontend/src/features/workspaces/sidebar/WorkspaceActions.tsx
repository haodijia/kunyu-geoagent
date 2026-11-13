import { ApiError } from "@/api/client";
import { matchRoute, useNavigation } from "@/app/navigation";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseSessionRoute } from "@/features/sessions/routes";
import {
  removeWorkspace,
  workspaceQueryKeys,
  type Workspace,
} from "@/features/workspaces/api";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { Ellipsis, Pencil, Upload, X } from "lucide-vue-next";
import { computed, defineComponent, reactive } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
const content = zhCN.workspaceSidebar;
export const WorkspaceActions = defineComponent(
  (
    componentProps: {
      readonly workspace: Workspace;
      readonly disabled: boolean;
      readonly onRename: () => void;
      readonly onUpload: () => void;
    },
    { slots: _slots },
  ) => {
    const workspace = computed(() => componentProps.workspace),
      disabled = computed(() => componentProps.disabled),
      onRename = computed(() => componentProps.onRename),
      onUpload = computed(() => componentProps.onUpload);
    const navigate = useNavigation();
    const location = useRoute();
    const queryClient = useQueryClient();
    const removal = reactive(
      useMutation({
        mutationFn: () => removeWorkspace(workspace.value.id),
        onSuccess: async () => {
          const stored = readLastSessionRoute();
          if (
            stored !== null &&
            parseSessionRoute(stored)?.workspaceId === workspace.value.id
          )
            clearLastSessionRoute();
          if (
            matchRoute("/workspaces/:workspaceId/*", location.path)?.params
              .workspaceId === workspace.value.id
          )
            await navigate("/", {
              replace: true,
            });
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.all,
            }),
            queryClient.invalidateQueries({
              queryKey: ["sessions"],
            }),
          ]);
          toast.success(content.removeSuccess);
        },
        onError: (error) => {
          console.error("[workspaces] Removal failed", error);
          toast.error(
            error instanceof ApiError && error.code === "RUN_CONFLICT"
              ? content.removeRunConflict
              : content.removeFailed,
          );
        },
      }),
    );
    return () => {
      const _disabled = disabled.value,
        _onUpload = onUpload.value,
        _onRename = onRename.value;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={content.workspaceActions}
              disabled={_disabled || removal.isPending}
              class="sider-action-btn hidden size-[20px] cursor-pointer items-center justify-center rounded-[4px] border-0 p-0 text-t-secondary transition-colors group-hover:flex group-focus-within:flex hover:text-t-primary data-[state=open]:flex"
              onClick={(event) => event.stopPropagation()}
            >
              <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" alignOffset={-8}>
            <DropdownMenuItem onSelect={_onUpload}>
              <Upload strokeWidth={1.75} aria-hidden="true" />
              {zhCN.workspaceFiles.title}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={_onRename}>
              <Pencil strokeWidth={1.75} aria-hidden="true" />
              {content.renameWorkspace}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={removal.isPending}
              onSelect={() => removal.mutate()}
            >
              <X strokeWidth={1.75} aria-hidden="true" />
              {content.removeWorkspace}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    };
  },
  {
    name: "WorkspaceActions",
    inheritAttrs: false,
    props: ["workspace", "disabled", "onRename", "onUpload"],
  },
);
