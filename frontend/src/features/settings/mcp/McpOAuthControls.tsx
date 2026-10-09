import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { mcpApi, type McpServer } from "./api";
import { mcpError, mcpQueryKey } from "./model";
const content = zhCN.mcp;
export function McpOAuthControls({ server }: { readonly server: McpServer }) {
  const cache = useQueryClient(),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const initiated = useRef<string | null>(null),
    opened = useRef<string | null>(null);
  const flow = server.auth.flow;
  useEffect(() => {
    if (
      flow?.authorization_url !== null &&
      flow?.authorization_url !== undefined &&
      initiated.current === flow.id &&
      opened.current !== flow.id
    ) {
      opened.current = flow.id;
      window.open(flow.authorization_url, "_blank", "noreferrer");
    }
  }, [flow]);
  async function act(kind: "login" | "logout" | "cancel") {
    setPending(true);
    setError(null);
    try {
      if (kind === "login") {
        const next = await mcpApi.login(server.config.name, server.revision);
        initiated.current = next.id;
      } else if (kind === "logout")
        await mcpApi.logout(server.config.name, server.revision);
      else if (flow !== null)
        await mcpApi.cancelLogin(server.config.name, flow.id);
      await cache.invalidateQueries({ queryKey: mcpQueryKey });
    } catch (error) {
      console.error("[mcp] OAuth action failed.", error);
      setError(mcpError(error));
    } finally {
      setPending(false);
    }
  }
  const failed = flow?.status === "failed";
  const failure =
    flow?.error_code === "MCP_OAUTH_DENIED"
      ? content.oauthDenied
      : flow?.error_code === "MCP_OAUTH_TIMEOUT"
        ? content.oauthTimedOut
        : content.oauthFailed;
  return (
    <div
      className="mt-3 ml-5 flex flex-col gap-2 text-xs text-t-secondary"
      data-mcp-oauth={server.config.name}
    >
      {server.auth.in_flight ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <LoaderCircle className="size-3.5 animate-spin" />
            {flow?.status === "waiting"
              ? content.waitingAuthorization
              : content.authorizing}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => void act("cancel")}
            >
              {content.cancelAuthorization}
            </Button>
          </div>
          {flow?.authorization_url && (
            <a
              className="w-fit underline underline-offset-2"
              href={flow.authorization_url}
              target="_blank"
              rel="noreferrer"
            >
              {content.openAuthorization}
            </a>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void act("login")}
          >
            <LogIn className="size-3.5" />
            {content.signIn}
          </Button>
          {server.auth.authenticated && (
            <>
              <span>{content.oauthAuthorized}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void act("logout")}
              >
                <LogOut className="size-3.5" />
                {content.signOut}
              </Button>
            </>
          )}
        </div>
      )}
      {failed && (
        <p className="text-destructive" role="alert">
          {failure}
        </p>
      )}
      {flow?.status === "cancelled" && <p>{content.oauthCancelled}</p>}
      {error !== null && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
