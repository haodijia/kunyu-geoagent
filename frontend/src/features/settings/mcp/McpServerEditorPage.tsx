import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { mcpApi, type McpConfig, type McpServer } from "./api";
import { mcpError, mcpQueryKey } from "./McpServersPage";

const content = zhCN.mcp;
const blank: McpConfig = {
  name: "",
  transport: "streamable-http",
  url: "",
  command: null,
  args: [],
  cwd: null,
  enabled: false,
  tool_timeout_ms: 60000,
  read_only_tools: [],
  reconnect: {
    enabled: true,
    initial_delay_ms: 500,
    max_delay_ms: 30000,
    max_attempts: 10,
  },
};
export function McpServerEditorPage() {
  const { serverName } = useParams(),
    navigate = useNavigate();
  const query = useQuery({
    queryKey: mcpQueryKey,
    queryFn: mcpApi.list,
    enabled: serverName !== undefined,
  });
  const server =
    serverName === undefined
      ? null
      : query.data?.find((server) => server.config.name === serverName);
  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={
          serverName === undefined ? content.add : content.edit(serverName)
        }
        description={content.editorDescription}
        actions={null}
        navigation={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void navigate("/settings/mcp")}
          >
            <ArrowLeft className="size-3.5" />
            {content.back}
          </Button>
        }
      />
      {serverName !== undefined && query.isPending ? (
        <div className="model-loading">
          <LoaderCircle className="size-5 animate-spin" />
          {content.loading}
        </div>
      ) : query.isError ? (
        <p role="alert" className="mt-6 text-destructive">
          {mcpError(query.error)}
        </p>
      ) : server === undefined ? (
        <p className="mt-6" role="alert">
          {content.notFound}
        </p>
      ) : (
        <Editor
          key={server === null ? "new" : server.config.name}
          server={server}
        />
      )}
    </SettingsPageWrapper>
  );
}
function Editor({ server }: { readonly server: McpServer | null }) {
  const [config, setConfig] = useState<McpConfig>(
      server === null ? blank : server.config,
    ),
    [args, setArgs] = useState(
      JSON.stringify(server === null ? [] : server.config.args),
    ),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [secretText, setSecretText] = useState("{}"),
    [secretStatus, setSecretStatus] = useState<string | null>(null);
  const [revision, setRevision] = useState(
    server === null ? 1 : server.revision,
  );
  const cache = useQueryClient(),
    navigate = useNavigate();
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const parsed: unknown = JSON.parse(args);
      if (
        !Array.isArray(parsed) ||
        parsed.some((arg) => typeof arg !== "string")
      )
        throw Error(content.argsInvalid);
      const body = {
        ...config,
        args: config.transport === "stdio" ? parsed : [],
      };
      if (server === null) await mcpApi.create(body);
      else await mcpApi.update(body, revision);
      await cache.invalidateQueries({ queryKey: mcpQueryKey });
      void navigate("/settings/mcp");
    } catch (error) {
      setError(mcpError(error));
    } finally {
      setPending(false);
    }
  }
  async function saveSecrets(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSecretStatus(null);
    setPending(true);
    try {
      const parsed: unknown = JSON.parse(secretText);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.values(parsed).some((value) => typeof value !== "string")
      )
        throw Error(content.secretsInvalid);
      const updated = await mcpApi.secrets(
        config.name,
        server!.config.transport,
        parsed as Record<string, string>,
        revision,
      );
      setRevision(updated.revision);
      setSecretText("{}");
      setSecretStatus(content.secretsSaved);
      await cache.invalidateQueries({ queryKey: mcpQueryKey });
    } catch (error) {
      setError(mcpError(error));
    } finally {
      setPending(false);
    }
  }
  const inputClass = "w-full";
  return (
    <div className="mt-6 max-w-[720px]">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => void save(event)}
      >
        <label className="flex flex-col gap-2 text-[13px]">
          {content.name}
          <Input
            className={inputClass}
            value={config.name}
            required
            pattern={"[A-Za-z0-9_\\-]{1,32}"}
            disabled={pending || server !== null}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2 text-[13px]">
          {content.transport}
          <select
            className="h-9 rounded-md border bg-background px-3"
            value={config.transport}
            disabled={pending}
            onChange={(e) => {
              const transport = e.target.value as McpConfig["transport"];
              setConfig({
                ...config,
                transport,
                url: transport === "streamable-http" ? "" : null,
                command: transport === "stdio" ? "" : null,
                args: [],
                cwd: null,
              });
              setArgs("[]");
            }}
          >
            <option value="streamable-http">Streamable HTTP</option>
            <option value="stdio">{content.stdio}</option>
          </select>
        </label>
        {config.transport === "streamable-http" ? (
          <label className="flex flex-col gap-2 text-[13px]">
            {content.url}
            <Input
              className={inputClass}
              value={config.url!}
              required
              placeholder="https://example.com/mcp"
              disabled={pending}
              onChange={(e) => setConfig({ ...config, url: e.target.value })}
            />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-2 text-[13px]">
              {content.command}
              <Input
                className={inputClass}
                value={config.command!}
                required
                disabled={pending}
                onChange={(e) =>
                  setConfig({ ...config, command: e.target.value })
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-[13px]">
              {content.args}
              <Input
                className={`${inputClass} font-mono text-xs`}
                value={args}
                disabled={pending}
                onChange={(e) => setArgs(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-[13px]">
              {content.cwd}
              <Input
                className={inputClass}
                value={config.cwd === null ? "" : config.cwd}
                disabled={pending}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    cwd: e.target.value === "" ? null : e.target.value,
                  })
                }
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-2 text-[13px]">
          {content.timeout}
          <Input
            type="number"
            min={1000}
            max={300000}
            step={1000}
            value={config.tool_timeout_ms}
            disabled={pending}
            onChange={(e) =>
              setConfig({ ...config, tool_timeout_ms: Number(e.target.value) })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={config.reconnect.enabled}
            disabled={pending}
            onCheckedChange={(value) =>
              setConfig({
                ...config,
                reconnect: { ...config.reconnect, enabled: value === true },
              })
            }
          />
          {content.autoReconnect}
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={config.enabled}
            disabled={pending}
            onCheckedChange={(value) =>
              setConfig({ ...config, enabled: value === true })
            }
          />
          {content.enabled}
        </label>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {content.save}
          </Button>
        </div>
      </form>
      {server !== null && (
        <form
          className="mt-8 flex flex-col gap-3 border-t pt-5"
          onSubmit={(event) => void saveSecrets(event)}
        >
          <h2 className="text-sm font-medium">{content.credentials}</h2>
          <p className="text-xs text-t-secondary">{content.secretHint}</p>
          <p className="text-xs text-t-secondary">
            {content.secretNames(server.secret_keys)}
          </p>
          <label className="flex flex-col gap-2 text-[13px]">
            {server.config.transport === "stdio"
              ? content.env
              : content.headers}
            <textarea
              className="min-h-24 w-full rounded-md border bg-background p-3 font-mono text-xs"
              value={secretText}
              disabled={pending}
              onChange={(e) => setSecretText(e.target.value)}
            />
          </label>
          <div>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={pending}
            >
              {content.replaceSecrets}
            </Button>
          </div>
          {secretStatus !== null && (
            <p className="text-xs text-success" role="status">
              {secretStatus}
            </p>
          )}
        </form>
      )}
      {error !== null && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
