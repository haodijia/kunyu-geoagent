import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useArchivedSessions,
  type ArchivedRow,
} from "@/features/sessions/archive/useArchivedSessions";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import {
  DeleteOne,
  FolderClose,
  ListCheckbox,
  MessageOne,
} from "@icon-park/vue-next";
import { Inbox, LoaderCircle } from "lucide-vue-next";
import { computed, defineComponent, toRefs } from "vue";
const content = zhCN.archivedSessions;
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export const ArchivedSessionsPage = defineComponent(
  (_props, { slots: _slots }) => {
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
      handleDeleteSelected,
    } = toRefs(useArchivedSessions());
    // One row of a project's quiet list: settings-list draws the hairlines between rows.
    const renderRow = (row: ArchivedRow) => (
      <div
        key={row.key}
        class={`group box-border flex h-[56px] items-center gap-[10px] px-[8px] py-[6px] transition-colors hover:bg-fill-1 ${selectionMode.value ? "cursor-pointer" : ""}`}
        onClick={() => {
          if (selectionMode.value) toggleRowSelected.value(row);
        }}
      >
        {selectionMode.value ? (
          <Checkbox
            aria-label={row.name}
            checked={selectedKeys.value.has(row.key)}
            onClick={(event) => event.stopPropagation()}
            onUpdate:modelValue={(checked) =>
              setRowSelected.value(row, checked === true)
            }
          />
        ) : null}
        <span class="size-[20px] flex items-center justify-center shrink-0 leading-none">
          <MessageOne
            theme="outline"
            size="16"
            class="block leading-none text-t-secondary"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-[500] text-t-primary">
            {row.name}
          </div>
          {row.updatedAt ? (
            <div class="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-t-secondary">
              {dateFormat.format(new Date(row.updatedAt))}
            </div>
          ) : null}
        </div>
        {!selectionMode.value ? (
          <div class="shrink-0 flex items-center gap-[6px]">
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-destructive hover:text-destructive"
              aria-label={content.delete}
              title={content.delete}
              onClick={() => handleDelete.value(row)}
            >
              <DeleteOne theme="outline" size="14" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              class="h-[28px]! px-[10px]!"
              onClick={() => void handleRestore.value(row)}
            >
              {content.restore}
            </Button>
          </div>
        ) : null}
      </div>
    );
    const body = computed(() => (
      <>
        <SettingsPageHeader
          title={content.title}
          description={content.description}
          actions={
            total.value > 0 ? (
              <div class="flex min-w-0 flex-wrap items-center justify-end gap-[10px]">
                {selectionMode.value ? (
                  <div class="flex flex-wrap items-center justify-end gap-[10px]">
                    <span class="text-[13px] text-t-secondary">
                      {content.selectedCount(selectedRows.value.length)}
                    </span>
                    <label class="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={
                          allRowsSelected.value
                            ? true
                            : selectedRows.value.length > 0
                              ? "indeterminate"
                              : false
                        }
                        onUpdate:modelValue={handleSelectAll.value}
                      />
                      {content.selectAll}
                    </label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCancelSelectionMode.value}
                    >
                      {content.cancelSelect}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={selectedRows.value.length === 0}
                      onClick={handleDeleteSelected.value}
                    >
                      {content.deleteSelected}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectionMode.value(true)}
                  >
                    <ListCheckbox theme="outline" size="14" />
                    {content.multiSelect}
                  </Button>
                )}
              </div>
            ) : null
          }
        />

        {loadError.value ? (
          <p role="alert" class="text-[13px] text-destructive">
            {content.loadFailed}
          </p>
        ) : null}
        {isLoading.value ? (
          <div class="flex items-center justify-center py-[64px]">
            <LoaderCircle
              class="size-5 animate-spin text-muted-foreground"
              role="status"
              aria-label={content.loading}
            />
          </div>
        ) : total.value === 0 ? (
          <div class="flex items-center justify-center py-[64px]">
            <div class="flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Inbox class="size-8" aria-hidden="true" />
              {content.empty}
            </div>
          </div>
        ) : (
          <div class="mt-[16px] flex flex-col gap-[12px]">
            <div class="flex flex-col gap-[16px]">
              {archivedBlocks.value.map((block) => {
                const blockSelected =
                  block.rows.length > 0 &&
                  block.rows.every((row) => selectedKeys.value.has(row.key));
                const blockPartiallySelected =
                  block.rows.some((row) => selectedKeys.value.has(row.key)) &&
                  !block.rows.every((row) => selectedKeys.value.has(row.key));
                return (
                  <section key={block.key} class="flex flex-col gap-[8px]">
                    <div class="flex items-center gap-[8px] px-[2px]">
                      {selectionMode.value ? (
                        <Checkbox
                          aria-label={block.name}
                          checked={
                            blockPartiallySelected
                              ? "indeterminate"
                              : blockSelected
                          }
                          onUpdate:modelValue={(checked) =>
                            setBlockSelected.value(block, checked === true)
                          }
                        />
                      ) : null}
                      <FolderClose
                        theme="outline"
                        size="16"
                        class="shrink-0 text-t-secondary"
                      />
                      <h2 class="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[600] text-t-primary">
                        {block.name}
                      </h2>
                      <span class="shrink-0 text-[12px] text-t-secondary">
                        {content.chatCount(block.rows.length)}
                      </span>
                    </div>
                    <div class="settings-list">
                      {block.rows.map((row) => renderRow(row))}
                    </div>
                    {block.hasMore ? (
                      <div class="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={loadingTokens.value.has(block.scopeToken)}
                          aria-busy={loadingTokens.value.has(block.scopeToken)}
                          onClick={() => void handleLoadMore.value(block)}
                        >
                          {loadingTokens.value.has(block.scopeToken) && (
                            <LoaderCircle class="size-3.5 animate-spin" />
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
    ));
    return () => {
      const _body = body.value;
      return (
        <SettingsPageWrapper>
          {_body}
          <AlertDialog
            open={deleteRequest.value !== null}
            onUpdate:open={(open) => {
              if (!open) cancelDelete.value();
            }}
          >
            {deleteRequest.value !== null && (
              <AlertDialogContent
                onEscapeKeyDown={(event) => {
                  if (deleting.value) event.preventDefault();
                }}
              >
                <AlertDialogTitle>{deleteRequest.value.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteRequest.value.description}
                </AlertDialogDescription>
                <div class="flex justify-end gap-2">
                  <AlertDialogCancel asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deleting.value}
                    >
                      {zhCN.workspaceSidebar.cancel}
                    </Button>
                  </AlertDialogCancel>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleting.value}
                    aria-busy={deleting.value}
                    onClick={() => void confirmDelete.value()}
                  >
                    {deleting.value && (
                      <LoaderCircle class="size-3.5 animate-spin" />
                    )}
                    {deleteRequest.value.label}
                  </Button>
                </div>
              </AlertDialogContent>
            )}
          </AlertDialog>
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "ArchivedSessionsPage",
    inheritAttrs: false,
    props: [],
  },
);
