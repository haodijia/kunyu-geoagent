import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import React from "react";
import { ApiError } from "@/api/client";
import { workspaceQueryKeys } from "@/features/workspaces/api";
import { zhCN } from "@/locales/zh-CN";
import { archivedSessionApi } from "./archive-api";
import { sessionQueryKeys, type SessionSummary } from "./api";

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
  const [deleteRequest, setDeleteRequest] =
    React.useState<DeleteRequest | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedKeys, setSelectedKeys] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [extraPages, setExtraPages] = React.useState<Record<string, ExtraPage>>(
    {}
  );
  const [loadingTokens, setLoadingTokens] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  );

  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    error: loadError,
    refetch: mutate
  } = useQuery({
    queryKey: sessionQueryKeys.archived,
    queryFn: () => archivedSessionApi.list(FIRST_SCREEN_LIMIT)
  });

  React.useEffect(() => {
    if (loadError) console.error("[archives] Loading failed", loadError);
  }, [loadError]);

  const refresh = React.useCallback(async () => {
    setExtraPages({});
    await mutate({ throwOnError: true });
  }, [mutate]);

  const restoredRef = React.useRef(false);
  React.useEffect(
    () => () => {
      if (restoredRef.current)
        void queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.all
        });
    },
    [queryClient]
  );

  const archivedBlocks = React.useMemo(
    () =>
      (data ?? []).map((group): ProjectBlock => {
        const extra = extraPages[group.workspace_id];
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
            updatedAt: session.created_at
          })),
          hasMore: extra ? extra.hasMore : group.has_more,
          cursor: extra ? extra.cursor : group.next_cursor
        };
      }),
    [data, extraPages]
  );
  const total = archivedBlocks.reduce(
    (count, group) => count + group.rows.length,
    0
  );

  const allRows = React.useMemo(
    () => archivedBlocks.flatMap((block) => block.rows),
    [archivedBlocks]
  );

  const selectedRows = React.useMemo(
    () => allRows.filter((row) => selectedKeys.has(row.key)),
    [allRows, selectedKeys]
  );
  const allRowsSelected =
    allRows.length > 0 && allRows.every((row) => selectedKeys.has(row.key));

  React.useEffect(() => {
    const availableKeys = new Set(allRows.map((row) => row.key));
    setSelectedKeys((prev) => {
      const next = new Set([...prev].filter((key) => availableKeys.has(key)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [allRows]);

  const setRowSelected = React.useCallback(
    (row: ArchivedRow, checked: boolean) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (checked) {
          next.add(row.key);
        } else {
          next.delete(row.key);
        }
        return next;
      });
    },
    []
  );

  const toggleRowSelected = React.useCallback((row: ArchivedRow) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) {
        next.delete(row.key);
      } else {
        next.add(row.key);
      }
      return next;
    });
  }, []);

  const setBlockSelected = React.useCallback(
    (block: ProjectBlock, checked: boolean) => {
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
    },
    []
  );

  const handleSelectAll = React.useCallback(() => {
    setSelectedKeys((prev) => {
      if (allRows.length > 0 && allRows.every((row) => prev.has(row.key))) {
        return new Set<string>();
      }
      return new Set(allRows.map((row) => row.key));
    });
  }, [allRows]);

  const handleCancelSelectionMode = React.useCallback(() => {
    setSelectionMode(false);
    setSelectedKeys(new Set<string>());
  }, []);

  const handleRestore = React.useCallback(
    async (row: ArchivedRow) => {
      try {
        const session = await archivedSessionApi.restore(row.item_id);
        queryClient.setQueryData(sessionQueryKeys.detail(session.id), session);
        restoredRef.current = true;
        await refresh();
        toast.success(content.restoreSuccess);
      } catch (error) {
        console.error("Failed to restore archived item:", error);
        toast.error(content.restoreFailed);
      }
    },
    [refresh, queryClient]
  );

  const handleLoadMore = React.useCallback(async (block: ProjectBlock) => {
    if (!block.hasMore || !block.cursor) return;
    const token = block.scopeToken;
    setLoadingTokens((prev) => new Set(prev).add(token));
    try {
      const page = await archivedSessionApi.page({
        workspaceId: token,
        cursor: block.cursor,
        limit: LOAD_MORE_LIMIT
      });
      setExtraPages((prev) => {
        const existing = prev[token]?.items ?? [];
        return {
          ...prev,
          [token]: {
            items: [...existing, ...page.items],
            hasMore: page.has_more,
            cursor: page.next_cursor
          }
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
  }, []);

  const handleDelete = React.useCallback((row: ArchivedRow) => {
    setDeleteRequest({
      title: content.deleteTitle,
      description: content.deleteDescription(row.name),
      label: content.delete,
      rows: [row],
      workspaceIds: [],
      sessionIds: [row.item_id]
    });
  }, []);

  const handleDeleteSelected = React.useCallback(() => {
    if (selectedRows.length === 0) return;

    const selectedProjectBlocks = archivedBlocks.filter(
      (block) =>
        block.projectId &&
        block.rows.length > 0 &&
        block.rows.every((row) => selectedKeys.has(row.key))
    );
    const projectSelectedKeys = new Set(
      selectedProjectBlocks.flatMap((block) => block.rows.map((row) => row.key))
    );
    const selectedSingleRows = selectedRows.filter(
      (row) => !projectSelectedKeys.has(row.key)
    );

    setDeleteRequest({
      title: content.deleteSelectedTitle,
      description: content.deleteSelectedDescription(selectedRows.length),
      label: content.deleteSelected,
      rows: [...selectedRows],
      workspaceIds: selectedProjectBlocks.map((block) => block.projectId),
      sessionIds: selectedSingleRows.map((row) => row.item_id)
    });
  }, [archivedBlocks, selectedKeys, selectedRows]);

  const confirmDelete = async () => {
    if (deleteRequest === null || deleting) return;
    setDeleting(true);
    try {
      await Promise.all([
        ...deleteRequest.workspaceIds.map((id) =>
          archivedSessionApi.deleteWorkspace(id)
        ),
        ...deleteRequest.sessionIds.map((id) =>
          archivedSessionApi.deleteItem(id)
        )
      ]);
      for (const row of deleteRequest.rows) {
        queryClient.removeQueries({
          queryKey: sessionQueryKeys.detail(row.item_id)
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
          : content.deleteFailed
      );
    } finally {
      setDeleting(false);
    }
  };

  return {
    deleteRequest,
    deleting,
    confirmDelete,
    cancelDelete: () => {
      if (!deleting) setDeleteRequest(null);
    },
    archivedBlocks,
    total,
    isLoading,
    loadError,
    selectionMode,
    setSelectionMode,
    selectedKeys,
    selectedRows,
    allRowsSelected,
    loadingTokens,
    toggleRowSelected,
    setRowSelected,
    setBlockSelected,
    handleSelectAll,
    handleCancelSelectionMode,
    handleRestore,
    handleLoadMore,
    handleDelete,
    handleDeleteSelected
  };
}
