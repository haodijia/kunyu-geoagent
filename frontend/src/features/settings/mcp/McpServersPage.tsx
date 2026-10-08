import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/client";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { mcpApi, type McpServer } from "./api";

const content = zhCN.mcp;
export const mcpQueryKey = ["mcp-servers"] as const;
export function mcpError(error: unknown): string {
  if (error instanceof ApiError && error.code === "MCP_NAME_EXISTS")
    return content.nameExists;
  if (error instanceof ApiError && error.code === "MCP_CONFIG_CHANGED")
    return content.changed;
  if (error instanceof ApiError && error.code === "MCP_BUSY")
    return content.busy;
  return error instanceof Error ? error.message : content.requestFailed;
}
export function McpServersPage() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: mcpQueryKey,
    queryFn: mcpApi.list,
    refetchInterval: 2500,
  });
  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={content.title}
        description={content.description}
        actions={
          <Button size="sm" onClick={() => void navigate("/settings/mcp/new")}>
            <Plus className="size-3.5" />
            {content.add}
          </Button>
        }
      />
      {query.isError && (
        <div className="model-notice model-notice--error mt-6" role="alert">
          <span>{mcpError(query.error)}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            {content.retry}
          </Button>
        </div>
      )}
      {query.isPending ? (
        <div className="model-loading">
          <LoaderCircle className="size-5 animate-spin" />
          {content.loading}
        </div>
      ) : query.data?.length === 0 ? (
        <div className="model-empty">
          <h2>{content.empty}</h2>
          <p>{content.emptyDescription}</p>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {query.data?.map((server) => (
            <ServerRow key={server.config.name} server={server} />
          ))}
        </div>
      )}
    </SettingsPageWrapper>
  );
}
function ServerRow({ server }: { readonly server: McpServer }) {
  const [expanded, setExpanded] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null),
    [deleting, setDeleting] = useState(false);
  const navigate = useNavigate(),
    cache = useQueryClient();
  const config = server.config,
    connecting =
      server.status === "connecting" || server.status === "reconnecting";
  async function action(operation: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await operation();
      await cache.invalidateQueries({ queryKey: mcpQueryKey });
      setDeleting(false);
    } catch (error) {
      setError(mcpError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="py-3" data-mcp-server={config.name}>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          {connecting ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-t-secondary" />
          ) : server.status === "connected" ? (
            <Check className="size-4 shrink-0 text-success" />
          ) : server.status === "failed" ? (
            <X className="size-4 shrink-0 text-destructive" />
          ) : null}
          <span className="min-w-0 truncate text-[13px] font-medium">
            {config.name}
          </span>
          <span className="shrink-0 text-xs text-t-secondary">
            {content.status[server.status]}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={pending}
            aria-label={content.reconnect(config.name)}
            onClick={() => void action(() => mcpApi.reconnect(config.name))}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={pending}
            aria-label={content.edit(config.name)}
            onClick={() =>
              void navigate(`/settings/mcp/${encodeURIComponent(config.name)}`)
            }
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={pending}
            aria-label={content.remove(config.name)}
            onClick={() => setDeleting((value) => !value)}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <label className="ml-2 flex items-center gap-2 text-xs text-t-secondary">
            <Checkbox
              checked={config.enabled}
              disabled={pending}
              aria-label={content.enabled}
              onCheckedChange={(checked) =>
                void action(() =>
                  mcpApi.update(
                    { ...config, enabled: checked === true },
                    server.revision,
                  ),
                )
              }
            />
            {content.enabled}
          </label>
        </div>
      </div>
      <div
        className="ml-5 min-w-0 truncate text-xs text-t-secondary"
        title={config.transport === "stdio" ? config.command! : config.url!}
      >
        {config.transport === "stdio" ? config.command : config.url}
      </div>
      {error !== null && (
        <p role="alert" className="my-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {server.error_code !== null && (
        <p className="mt-2 text-xs text-destructive">
          {content.connectionFailed}
        </p>
      )}
      {deleting && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span>{content.deletePrompt(config.name)}</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => void action(() => mcpApi.remove(config.name))}
          >
            {content.deleteConfirm}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>
            {content.cancel}
          </Button>
        </div>
      )}
      {expanded && (
        <div className="mt-3 ml-5">
          <p className="mb-2 text-xs text-t-secondary">
            {server.catalog === null
              ? content.noCatalog
              : content.catalog(
                  server.catalog.tools.length,
                  server.status !== "connected",
                )}
          </p>
          <div className="divide-y divide-border">
            {server.catalog?.tools.map((tool) => (
              <div key={tool.name} className="flex min-w-0 gap-4 py-2">
                <div className="w-1/3 min-w-0 shrink-0">
                  <div
                    className="break-words text-[13px] font-medium"
                    title={tool.public_name}
                  >
                    {tool.name}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="m-0 truncate text-xs leading-5 text-t-secondary"
                    title={tool.description}
                  >
                    {tool.description}
                  </p>
                  <label className="mt-1 flex items-center gap-2 text-xs text-t-secondary">
                    <Checkbox
                      checked={config.read_only_tools.includes(tool.name)}
                      disabled={pending || server.status !== "connected"}
                      aria-label={content.readOnly(tool.name)}
                      onCheckedChange={(checked) =>
                        void action(() =>
                          mcpApi.update(
                            {
                              ...config,
                              read_only_tools:
                                checked === true
                                  ? [...config.read_only_tools, tool.name]
                                  : config.read_only_tools.filter(
                                      (name) => name !== tool.name,
                                    ),
                            },
                            server.revision,
                          ),
                        )
                      }
                    />
                    {content.readOnlyLabel}
                    {tool.annotations?.readOnlyHint === true && (
                      <span>{content.serverReadOnly}</span>
                    )}
                  </label>
                </div>
              </div>
            ))}
          </div>
          {server.catalog !== null &&
            "resources" in server.catalog.capabilities && (
              <p className="mt-3 text-xs text-t-secondary">
                {content.resources}
              </p>
            )}
          <p className="mt-3 text-xs text-t-secondary">
            {content.approvalHint}
          </p>
        </div>
      )}
    </section>
  );
}
