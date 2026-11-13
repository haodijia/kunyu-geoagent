import { usableModelsFrom } from "@/features/messages/state/model-selection";
import { modelConnectionsApi } from "@/features/settings/models/api";
import { ogeAccountApi, ogeAccountQueryKey } from "@/features/settings/oge/api";
import { productCopy as copy } from "@/locales/zh-CN/product";
import { useQuery } from "@tanstack/vue-query";
import { ArrowUpRight, CheckCircle2, Circle } from "lucide-vue-next";
import { computed, defineComponent, reactive } from "vue";
import { RouterLink } from "vue-router";
export const ConnectionReadiness = defineComponent(
  (
    componentProps: {
      readonly remote?: boolean;
    },
    { slots: _slots },
  ) => {
    const remote = computed(() =>
      componentProps.remote === undefined ? true : componentProps.remote,
    );
    const models = reactive(
      useQuery(
        computed(() => ({
          queryKey: ["model-connections"],
          queryFn: modelConnectionsApi.list,
        })),
      ),
    );
    const oge = reactive(
      useQuery(
        computed(() => ({
          queryKey: ogeAccountQueryKey,
          queryFn: ogeAccountApi.status,
          enabled: remote.value,
        })),
      ),
    );
    const checks = computed(() => [
      {
        name: copy.model,
        hint: copy.modelHint,
        ready: usableModelsFrom(models.data ?? []).length > 0,
        query: models,
        path: "/settings/models",
      },
      ...(remote.value
        ? [
            {
              name: copy.oge,
              hint: copy.ogeHint,
              ready: oge.data?.state === "signed_in",
              query: oge,
              path: "/settings/oge",
            },
          ]
        : []),
    ]);
    return () => {
      const _checks = checks.value;
      return (
        <div class="flex flex-wrap gap-3" aria-label={copy.setup}>
          {_checks.map((check) => (
            <div
              key={check.path}
              class="flex min-w-52 flex-1 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
            >
              {check.ready ? (
                <CheckCircle2 class="size-4 shrink-0 text-success" />
              ) : (
                <Circle class="size-4 shrink-0 text-muted-foreground" />
              )}
              <div class="min-w-0 flex-1 text-xs">
                <div class="flex items-center gap-2 text-sm font-medium">
                  {check.name}
                  <span class="text-xs font-normal text-muted-foreground">
                    {check.query.isPending
                      ? copy.checking
                      : check.query.isError
                        ? ""
                        : check.ready
                          ? copy.ready
                          : copy.missing}
                  </span>
                </div>
                {check.query.isError ? (
                  <button
                    type="button"
                    class="mt-1 text-destructive underline"
                    onClick={() => void check.query.refetch()}
                  >
                    {copy.checkFailed}
                  </button>
                ) : (
                  <p class="mt-1 text-muted-foreground">{check.hint}</p>
                )}
              </div>
              <RouterLink
                to={check.path}
                aria-label={`${check.name} · ${copy.openSettings}`}
                class="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <ArrowUpRight class="size-4" />
              </RouterLink>
            </div>
          ))}
        </div>
      );
    };
  },
  {
    name: "ConnectionReadiness",
    inheritAttrs: false,
    props: ["remote"],
  },
);
