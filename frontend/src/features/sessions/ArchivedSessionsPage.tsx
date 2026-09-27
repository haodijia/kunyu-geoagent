import { Inbox, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription
} from "@/components/ui/alert-dialog";
import {
  DeleteOne,
  FolderClose,
  ListCheckbox,
  MessageOne
} from "@icon-park/react";
import {
  SettingsPageHeader,
  SettingsPageWrapper
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { useArchivedSessions, type ArchivedRow } from "./useArchivedSessions";

const content = zhCN.archivedSessions;
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function ArchivedSessionsPage() {
  const {
    deleteRequest,
    deleting,
    confirmDelete,
    cancelDelete,
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
  } = useArchivedSessions();
  // One row of a project's quiet list: settings-list draws the hairlines between rows.
  const renderRow = (row: ArchivedRow) => (
    <div
      key={row.key}
      className={`group box-border flex h-[56px] items-center gap-[10px] px-[8px] py-[6px] transition-colors hover:bg-fill-1 ${
        selectionMode ? "cursor-pointer" : ""
      }`}
      onClick={() => {
        if (selectionMode) toggleRowSelected(row);
      }}
    >
      {selectionMode ? (
        <Checkbox
          aria-label={row.name}
          checked={selectedKeys.has(row.key)}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => setRowSelected(row, checked === true)}
        />
      ) : null}
      <span className="size-[20px] flex items-center justify-center shrink-0 leading-none">
        <MessageOne
          theme="outline"
          size="16"
          className="block leading-none text-t-secondary"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-[500] text-t-primary">
          {row.name}
        </div>
        {row.updatedAt ? (
          <div className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-t-secondary">
            {dateFormat.format(new Date(row.updatedAt))}
          </div>
        ) : null}
      </div>
      {!selectionMode ? (
        <div className="shrink-0 flex items-center gap-[6px]">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            aria-label={content.delete}
            title={content.delete}
            onClick={() => handleDelete(row)}
          >
            <DeleteOne theme="outline" size="14" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-[28px]! px-[10px]!"
            onClick={() => void handleRestore(row)}
          >
            {content.restore}
          </Button>
        </div>
      ) : null}
    </div>
  );

  const body = (
    <>
      <SettingsPageHeader
        title={content.title}
        description={content.description}
        actions={
          total > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-[10px]">
              {selectionMode ? (
                <div className="flex flex-wrap items-center justify-end gap-[10px]">
                  <span className="text-[13px] text-t-secondary">
                    {content.selectedCount(selectedRows.length)}
                  </span>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={
                        allRowsSelected
                          ? true
                          : selectedRows.length > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={handleSelectAll}
                    />
                    {content.selectAll}
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCancelSelectionMode}
                  >
                    {content.cancelSelect}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={selectedRows.length === 0}
                    onClick={handleDeleteSelected}
                  >
                    {content.deleteSelected}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectionMode(true)}
                >
                  <ListCheckbox theme="outline" size="14" />
                  {content.multiSelect}
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {loadError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {content.loadFailed}
        </p>
      ) : null}
      {isLoading ? (
        <div className="flex items-center justify-center py-[64px]">
          <LoaderCircle
            className="size-5 animate-spin text-muted-foreground"
            role="status"
            aria-label={content.loading}
          />
        </div>
      ) : total === 0 ? (
        <div className="flex items-center justify-center py-[64px]">
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Inbox className="size-8" aria-hidden="true" />
            {content.empty}
          </div>
        </div>
      ) : (
        <div className="mt-[16px] flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[16px]">
            {archivedBlocks.map((block) => {
              const blockSelected =
                block.rows.length > 0 &&
                block.rows.every((row) => selectedKeys.has(row.key));
              const blockPartiallySelected =
                block.rows.some((row) => selectedKeys.has(row.key)) &&
                !block.rows.every((row) => selectedKeys.has(row.key));
              return (
                <section key={block.key} className="flex flex-col gap-[8px]">
                  <div className="flex items-center gap-[8px] px-[2px]">
                    {selectionMode ? (
                      <Checkbox
                        aria-label={block.name}
                        checked={
                          blockPartiallySelected
                            ? "indeterminate"
                            : blockSelected
                        }
                        onCheckedChange={(checked) =>
                          setBlockSelected(block, checked === true)
                        }
                      />
                    ) : null}
                    <FolderClose
                      theme="outline"
                      size="16"
                      className="shrink-0 text-t-secondary"
                    />
                    <h2 className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[600] text-t-primary">
                      {block.name}
                    </h2>
                    <span className="shrink-0 text-[12px] text-t-secondary">
                      {content.chatCount(block.rows.length)}
                    </span>
                  </div>
                  <div className="settings-list">
                    {block.rows.map((row) => renderRow(row))}
                  </div>
                  {block.hasMore ? (
                    <div className="flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loadingTokens.has(block.scopeToken)}
                        aria-busy={loadingTokens.has(block.scopeToken)}
                        onClick={() => void handleLoadMore(block)}
                      >
                        {loadingTokens.has(block.scopeToken) && (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        )}
                        {content.loadMore}
                      </Button>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <SettingsPageWrapper>
      {body}
      <AlertDialog
        open={deleteRequest !== null}
        onOpenChange={(open) => {
          if (!open) cancelDelete();
        }}
      >
        {deleteRequest !== null && (
          <AlertDialogContent
            onEscapeKeyDown={(event) => {
              if (deleting) event.preventDefault();
            }}
          >
            <AlertDialogTitle>{deleteRequest.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRequest.description}
            </AlertDialogDescription>
            <div className="flex justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button variant="outline" size="sm" disabled={deleting}>
                  {zhCN.workspaceSidebar.cancel}
                </Button>
              </AlertDialogCancel>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                aria-busy={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting && <LoaderCircle className="size-3.5 animate-spin" />}
                {deleteRequest.label}
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </SettingsPageWrapper>
  );
}
