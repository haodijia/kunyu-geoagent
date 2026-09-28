import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle, Plus, ServerCog } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  SettingsPageHeader,
  SettingsPageWrapper
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { modelConnectionsApi } from "./api";
import { connectionErrorMessage, connectionStatus } from "./model";

const content = zhCN.modelConnections;

export function ModelConnectionsPage() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["model-connections"],
    queryFn: modelConnectionsApi.list,
    refetchInterval: (state) =>
      state.state.data?.some(
        (connection) =>
          connection.management_status !== "ready" ||
          connection.discovery.status === "pending"
      )
        ? 1200
        : false
  });
  const connections = query.data ?? [];

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={content.title}
        description={content.description}
        actions={
          <Button size="sm" onClick={() => void navigate("/settings/models/new")}>
            <Plus className="size-3.5" />
            {content.add}
          </Button>
        }
      />

      {query.isError ? (
        <div className="model-settings-notice model-settings-notice--error" role="alert">
          <span>{connectionErrorMessage(query.error)}</span>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            {content.retry}
          </Button>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="model-settings-loading" role="status">
          <LoaderCircle className="size-5 animate-spin" />
          <span>{content.loading}</span>
        </div>
      ) : connections.length === 0 ? (
        <div className="model-settings-empty">
          <span className="model-settings-empty__icon">
            <ServerCog className="size-6" />
          </span>
          <h2>{content.emptyTitle}</h2>
          <p>{content.emptyDescription}</p>
          <Button size="sm" onClick={() => void navigate("/settings/models/new")}>
            <Plus className="size-3.5" />
            {content.addFirst}
          </Button>
        </div>
      ) : (
        <section className="model-connections-section" aria-label={content.connectionList}>
          <div className="model-connections-heading">
            <h2>{content.connectionCount(connections.length)}</h2>
          </div>
          <div className="model-connections-list">
            {connections.map((connection) => {
              const status = connectionStatus(connection);
              const modelSummary = connection.default_model_id ??
                content.availableModelCount(
                  connection.entries.filter(
                    (entry) =>
                      entry.revision === connection.revision &&
                      entry.availability === "available"
                  ).length
                );
              return (
                <button
                  type="button"
                  className="model-connection-row"
                  key={connection.id}
                  onClick={() => void navigate(`/settings/models/${connection.id}`)}
                >
                  <span className="model-connection-row__mark" aria-hidden="true">
                    <ServerCog className="size-5" />
                  </span>
                  <span className="model-connection-row__body">
                    <span className="model-connection-row__title">
                      <span>{connection.display_name}</span>
                      {connection.is_default ? (
                        <span className="model-settings-tag">{content.defaultBadge}</span>
                      ) : null}
                    </span>
                    <span className="model-connection-row__meta">
                      {connection.base_url} · {modelSummary}
                    </span>
                  </span>
                  <span className={`model-connection-status model-connection-status--${status.tone}`}>
                    <span className="model-connection-status__dot" />
                    {status.label}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="model-security-note">
            <span className="model-security-note__icon" aria-hidden="true">✓</span>
            <span>{content.securityNote}</span>
          </div>
        </section>
      )}
    </SettingsPageWrapper>
  );
}
