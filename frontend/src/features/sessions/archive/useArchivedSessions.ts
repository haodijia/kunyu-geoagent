import { ApiError } from "@/api/client";
import { sessionQueryKeys, type SessionSummary } from "@/features/sessions/api";
import { archivedSessionApi } from "@/features/sessions/archive/archive-api";
import { workspaceQueryKeys } from "@/features/workspaces/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, reactive, shallowReactive, shallowRef, toRefs } from "vue";
import { toast } from "vue-sonner";
const FIRST_SCREEN_LIMIT = 5;
const LOAD_MORE_LIMIT = 10;
const content = zhCN.archivedSessions;
type ExtraPage = {
  items: SessionSummary[];
  hasMore: boolean;
  cursor: string | null;
};
export type ArchivedRow = {
  key: string;
  item_id: string;
  name: string;
  updatedAt: string;
};
export type ProjectBlock = {
  key: string;
  name: string;
  rows: ArchivedRow[];
  projectId: string;
  scopeToken: string;
  hasMore: boolean;
  cursor: string | null;
};
type DeleteRequest = {
  title: string;
  description: string;
  label: string;
  rows: ArchivedRow[];
  workspaceIds: string[];
  sessionIds: string[];
};
export function useArchivedSessions() {
  const deleteRequest = shallowRef<DeleteRequest | null>(null),
    setDeleteRequest = refSetter(deleteRequest);
  const deleting = shallowRef(false),
    setDeleting = refSetter(deleting);
  const selectionMode = shallowRef(false),
    setSelectionMode = refSetter(selectionMode);
  const selectedKeys = shallowRef<ReadonlySet<string>>(
      (() => new Set<string>())(),
    ),
    setSelectedKeys = refSetter(selectedKeys);
  const extraPages = shallowRef<Record<string, ExtraPage>>({}),
    setExtraPages = refSetter(extraPages);
  const loadingTokens = shallowRef<ReadonlySet<string>>(
      (() => new Set<string>())(),
    ),
    setLoadingTokens = refSetter(loadingTokens);
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    error: loadError,
    refetch: mutate,
  } = toRefs(
    reactive(
      useQuery(
        computed(() => ({
          queryKey: sessionQueryKeys.archived,
          queryFn: () => archivedSessionApi.list(FIRST_SCREEN_LIMIT),
        })),
      ),
    ),
  );
  watchMounted([() => loadError.value], () => {
    if (loadError.value)
      console.error("[archives] Loading failed", loadError.value);
  });
  const refresh = async () => {
    setExtraPages({});
    await mutate.value({
      throwOnError: true,
    });
  };
  const restoredRef = shallowRef(false);
  watchMounted([() => queryClient], () => () => {
    if (restoredRef.value)
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.all,
      });
  });
  const archivedBlocks = computed(() =>
    (data.value ?? []).map((group): ProjectBlock => {
      const extra = extraPages.value[group.workspace_id];
      const items = extra ? [...group.items, ...extra.items] : group.items;
      return {
        key: group.workspace_id,
        name: group.workspace_name,
        projectId: group.workspace_id,
        scopeToken: group.workspace_id,
        rows: items.map((session) => ({
          key: session.id,
          item_id: session.id,
          name: session.title,
          updatedAt: session.created_at,
        })),
        hasMore: extra ? extra.hasMore : group.has_more,
        cursor: extra ? extra.cursor : group.next_cursor,
      };
    }),
  );
  const total = computed(() =>
    archivedBlocks.value.reduce((count, group) => count + group.rows.length, 0),
  );
  const allRows = computed(() =>
    archivedBlocks.value.flatMap((block) => block.rows),
  );
  const selectedRows = computed(() =>
    allRows.value.filter((row) => selectedKeys.value.has(row.key)),
  );
  const allRowsSelected = computed(
    () =>
      allRows.value.length > 0 &&
      allRows.value.every((row) => selectedKeys.value.has(row.key)),
  );
  watchMounted([() => allRows.value], () => {
    const availableKeys = new Set(allRows.value.map((row) => row.key));
    setSelectedKeys((prev) => {
      const next = new Set([...prev].filter((key) => availableKeys.has(key)));
      if (next.size === prev.size) return prev;
      return next;
    });
  });
  const setRowSelected = (row: ArchivedRow, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(row.key);
      } else {
        next.delete(row.key);
      }
      return next;
    });
  };
  const toggleRowSelected = (row: ArchivedRow) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) {
        next.delete(row.key);
      } else {
        next.add(row.key);
      }
      return next;
    });
  };
  const setBlockSelected = (block: ProjectBlock, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const row of block.rows) {
        if (checked) {
          next.add(row.key);
        } else {
          next.delete(row.key);
        }
      }
      return next;
    });
  };
  const handleSelectAll = () => {
    setSelectedKeys((prev) => {
      if (
        allRows.value.length > 0 &&
        allRows.value.every((row) => prev.has(row.key))
      ) {
        return new Set<string>();
      }
      return new Set(allRows.value.map((row) => row.key));
    });
  };
  const handleCancelSelectionMode = () => {
    setSelectionMode(false);
    setSelectedKeys(new Set<string>());
  };
  const handleRestore = async (row: ArchivedRow) => {
    try {
      const session = await archivedSessionApi.restore(row.item_id);
      queryClient.setQueryData(sessionQueryKeys.detail(session.id), session);
      restoredRef.value = true;
      await refresh();
      toast.success(content.restoreSuccess);
    } catch (error) {
      console.error("Failed to restore archived item:", error);
      toast.error(content.restoreFailed);
    }
  };
  const handleLoadMore = async (block: ProjectBlock) => {
    if (!block.hasMore || !block.cursor) return;
    const token = block.scopeToken;
    setLoadingTokens((prev) => new Set(prev).add(token));
    try {
      const page = await archivedSessionApi.page({
        workspaceId: token,
        cursor: block.cursor,
        limit: LOAD_MORE_LIMIT,
      });
      setExtraPages((prev) => {
        const existing = prev[token]?.items ?? [];
        return {
          ...prev,
          [token]: {
            items: [...existing, ...page.items],
            hasMore: page.has_more,
            cursor: page.next_cursor,
          },
        };
      });
    } catch (error) {
      console.error("Failed to load more archived items:", error);
      toast.error(content.loadFailed);
    } finally {
      setLoadingTokens((prev) => {
        const next = new Set(prev);
        next.delete(token);
        return next;
      });
    }
  };
  const handleDelete = (row: ArchivedRow) => {
    setDeleteRequest({
      title: content.deleteTitle,
      description: content.deleteDescription(row.name),
      label: content.delete,
      rows: [row],
      workspaceIds: [],
      sessionIds: [row.item_id],
    });
  };
  const handleDeleteSelected = () => {
    if (selectedRows.value.length === 0) return;
    const selectedProjectBlocks = archivedBlocks.value.filter(
      (block) =>
        block.projectId &&
        block.rows.length > 0 &&
        block.rows.every((row) => selectedKeys.value.has(row.key)),
    );
    const projectSelectedKeys = new Set(
      selectedProjectBlocks.flatMap((block) =>
        block.rows.map((row) => row.key),
      ),
    );
    const selectedSingleRows = selectedRows.value.filter(
      (row) => !projectSelectedKeys.has(row.key),
    );
    setDeleteRequest({
      title: content.deleteSelectedTitle,
      description: content.deleteSelectedDescription(selectedRows.value.length),
      label: content.deleteSelected,
      rows: [...selectedRows.value],
      workspaceIds: selectedProjectBlocks.map((block) => block.projectId),
      sessionIds: selectedSingleRows.map((row) => row.item_id),
    });
  };
  const confirmDelete = async () => {
    if (deleteRequest.value === null || deleting.value) return;
    setDeleting(true);
    try {
      await Promise.all([
        ...deleteRequest.value.workspaceIds.map((id) =>
          archivedSessionApi.deleteWorkspace(id),
        ),
        ...deleteRequest.value.sessionIds.map((id) =>
          archivedSessionApi.deleteItem(id),
        ),
      ]);
      for (const row of deleteRequest.value.rows) {
        queryClient.removeQueries({
          queryKey: sessionQueryKeys.detail(row.item_id),
        });
      }
      setSelectedKeys(new Set<string>());
      setSelectionMode(false);
      setDeleteRequest(null);
      await refresh();
      toast.success(content.deleteSuccess);
    } catch (error) {
      console.error("[archives] Deletion failed", error);
      toast.error(
        error instanceof ApiError && error.code === "RUN_CONFLICT"
          ? content.deleteRunConflict
          : content.deleteFailed,
      );
    } finally {
      setDeleting(false);
    }
  };
  return shallowReactive({
    get deleteRequest() {
      return deleteRequest.value;
    },
    get deleting() {
      return deleting.value;
    },
    get confirmDelete() {
      return confirmDelete;
    },
    get cancelDelete() {
      return () => {
        if (!deleting.value) setDeleteRequest(null);
      };
    },
    get archivedBlocks() {
      return archivedBlocks.value;
    },
    get total() {
      return total.value;
    },
    get isLoading() {
      return isLoading.value;
    },
    get loadError() {
      return loadError.value;
    },
    get selectionMode() {
      return selectionMode.value;
    },
    get setSelectionMode() {
      return setSelectionMode;
    },
    get selectedKeys() {
      return selectedKeys.value;
    },
    get selectedRows() {
      return selectedRows.value;
    },
    get allRowsSelected() {
      return allRowsSelected.value;
    },
    get loadingTokens() {
      return loadingTokens.value;
    },
    get toggleRowSelected() {
      return toggleRowSelected;
    },
    get setRowSelected() {
      return setRowSelected;
    },
    get setBlockSelected() {
      return setBlockSelected;
    },
    get handleSelectAll() {
      return handleSelectAll;
    },
    get handleCancelSelectionMode() {
      return handleCancelSelectionMode;
    },
    get handleRestore() {
      return handleRestore;
    },
    get handleLoadMore() {
      return handleLoadMore;
    },
    get handleDelete() {
      return handleDelete;
    },
    get handleDeleteSelected() {
      return handleDeleteSelected;
    },
  });
}
