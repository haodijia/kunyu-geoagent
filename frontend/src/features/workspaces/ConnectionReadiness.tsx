import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { modelConnectionsApi } from "@/features/settings/models/api";
import { usableModelsFrom } from "@/features/messages/state/model-selection";
import { ogeAccountApi, ogeAccountQueryKey } from "@/features/settings/oge/api";
import { productCopy as copy } from "@/locales/zh-CN/product";

export function ConnectionReadiness({
  remote = true,
}: {
  readonly remote?: boolean;
}) {
  const models = useQuery({
    queryKey: ["model-connections"],
    queryFn: modelConnectionsApi.list,
  });
  const oge = useQuery({
    queryKey: ogeAccountQueryKey,
    queryFn: ogeAccountApi.status,
    enabled: remote,
  });
  const checks = [
    {
      name: copy.model,
      hint: copy.modelHint,
      ready: usableModelsFrom(models.data ?? []).length > 0,
      query: models,
      path: "/settings/models",
    },
    ...(remote
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
  ];
  return (
    <div className="flex flex-wrap gap-3" aria-label={copy.setup}>
      {checks.map((check) => (
        <div
          key={check.path}
          className="flex min-w-52 flex-1 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
        >
          {check.ready ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" />
          ) : (
            <Circle className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <div className="flex items-center gap-2 text-sm font-medium">
              {check.name}
              <span className="text-xs font-normal text-muted-foreground">
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
                className="mt-1 text-destructive underline"
                onClick={() => void check.query.refetch()}
              >
                {copy.checkFailed}
              </button>
            ) : (
              <p className="mt-1 text-muted-foreground">{check.hint}</p>
            )}
          </div>
          <Link
            to={check.path}
            aria-label={`${check.name} · ${copy.openSettings}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}
