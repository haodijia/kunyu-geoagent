import { useNavigation } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import {
  modelConnectionsApi,
  type ModelConnection,
} from "@/features/settings/models/api";
import {
  connectionErrorMessage,
  connectionStatus,
} from "@/features/settings/models/model";
import { providerName } from "@/features/settings/models/provider-copy";
import { ProviderLogo } from "@/features/settings/models/ProviderLogo";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import { ChevronRight, LoaderCircle, Plus } from "lucide-vue-next";
import { computed, defineComponent, reactive } from "vue";
const content = zhCN.modelConnections;
export const ModelConnectionsPage = defineComponent(
  (_props, { slots: _slots }) => {
    const navigate = useNavigation();
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey: ["model-connections"],
          queryFn: modelConnectionsApi.list,
          refetchInterval: (state: {
            state: { data: ModelConnection[] | undefined };
          }) =>
            state.state.data?.some(
              (connection) => connection.discovery.status === "pending",
            )
              ? 1200
              : false,
        })),
      ),
    );
    const connections = computed(() => query.data ?? []);
    return () => {
      const _connections = connections.value;
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={content.title}
            description={content.description}
            actions={null}
          />
          <section
            class="model-connections"
            aria-label={content.connectionList}
          >
            <div class="model-connections__toolbar">
              <div class="model-connections__heading">
                <h2>{content.connections}</h2>
                {_connections.length > 0 ? (
                  <span>{content.count(_connections.length)}</span>
                ) : null}
              </div>
              <Button
                size="sm"
                onClick={() => void navigate("/settings/models/new")}
              >
                <Plus class="size-3.5" />
                {content.add}
              </Button>
            </div>

            {query.isError ? (
              <div class="model-notice model-notice--error" role="alert">
                <span>{connectionErrorMessage(query.error)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void query.refetch()}
                >
                  {content.retry}
                </Button>
              </div>
            ) : null}

            {query.isLoading ? (
              <div class="model-loading" role="status">
                <LoaderCircle class="size-5 animate-spin" />
                <span>{content.loading}</span>
              </div>
            ) : _connections.length === 0 ? (
              <div class="model-empty">
                <h2>{content.emptyTitle}</h2>
                <p>{content.emptyDescription}</p>
                <Button
                  size="sm"
                  onClick={() => void navigate("/settings/models/new")}
                >
                  <Plus class="size-3.5" />
                  {content.add}
                </Button>
              </div>
            ) : (
              <div class="provider-list provider-list--connections">
                {_connections.map((connection) => {
                  const status = connectionStatus(connection);
                  const subtitle = [
                    providerName[connection.provider_type],
                    connection.default_model_id,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(" · ");
                  return (
                    <button
                      type="button"
                      key={connection.id}
                      class="provider-row"
                      data-disabled={!connection.enabled || undefined}
                      onClick={() =>
                        void navigate(`/settings/models/${connection.id}`)
                      }
                    >
                      <ProviderLogo type={connection.provider_type} compact />
                      <span class="provider-row__body">
                        <span class="provider-row__title">
                          <strong>{connection.display_name}</strong>
                          {connection.is_default ? (
                            <span class="model-badge">
                              {content.defaultBadge}
                            </span>
                          ) : null}
                        </span>
                        <span>{subtitle}</span>
                      </span>
                      <span class={`model-status model-status--${status.tone}`}>
                        <span class="model-status__dot" />
                        {status.label}
                      </span>
                      <ChevronRight
                        class="size-4 text-t-tertiary"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "ModelConnectionsPage",
    inheritAttrs: false,
    props: [],
  },
);
