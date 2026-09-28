import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LoaderCircle, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { SettingsPageHeader, SettingsPageWrapper } from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { modelConnectionsApi } from "./api";
import { connectionErrorMessage, connectionStatus } from "./model";
import { providerName } from "./provider-copy";
import { ProviderLogo } from "./ProviderLogo";

const content = zhCN.modelConnections;

export function ModelConnectionsPage() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["model-connections"],
    queryFn: modelConnectionsApi.list,
    refetchInterval: (state) =>
      state.state.data?.some((connection) => connection.discovery.status === "pending")
        ? 1200
        : false
  });
  const connections = query.data ?? [];

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader title={content.title} description={content.description} actions={null} />
      <section className="model-connections" aria-label={content.connectionList}>
        <div className="model-connections__toolbar">
          <div className="model-connections__heading">
            <h2>{content.connections}</h2>
            {connections.length > 0 ? <span>{content.count(connections.length)}</span> : null}
          </div>
          <Button size="sm" onClick={() => void navigate("/settings/models/new")}>
            <Plus className="size-3.5" />
            {content.add}
          </Button>
        </div>

        {query.isError ? (
          <div className="model-notice model-notice--error" role="alert">
            <span>{connectionErrorMessage(query.error)}</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{content.retry}</Button>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="model-loading" role="status">
            <LoaderCircle className="size-5 animate-spin" />
            <span>{content.loading}</span>
          </div>
        ) : connections.length === 0 ? (
          <div className="model-empty">
            <h2>{content.emptyTitle}</h2>
            <p>{content.emptyDescription}</p>
            <Button size="sm" onClick={() => void navigate("/settings/models/new")}>
              <Plus className="size-3.5" />
              {content.add}
            </Button>
          </div>
        ) : (
          <div className="provider-list provider-list--connections">
            {connections.map((connection) => {
              const status = connectionStatus(connection);
              const subtitle = [providerName[connection.provider_type], connection.default_model_id]
                .filter((part): part is string => Boolean(part))
                .join(" · ");
              return (
                <button
                  type="button"
                  key={connection.id}
                  className="provider-row"
                  data-disabled={!connection.enabled || undefined}
                  onClick={() => void navigate(`/settings/models/${connection.id}`)}
                >
                  <ProviderLogo type={connection.provider_type} compact />
                  <span className="provider-row__body">
                    <span className="provider-row__title">
                      <strong>{connection.display_name}</strong>
                      {connection.is_default ? <span className="model-badge">{content.defaultBadge}</span> : null}
                    </span>
                    <span>{subtitle}</span>
                  </span>
                  <span className={`model-status model-status--${status.tone}`}>
                    <span className="model-status__dot" />
                    {status.label}
                  </span>
                  <ChevronRight className="size-4 text-t-tertiary" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </SettingsPageWrapper>
  );
}
