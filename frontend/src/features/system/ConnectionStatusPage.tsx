import { useQuery } from "@tanstack/react-query";

import { getRuntimeConnection } from "@/api/runtime";
import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { getHealth } from "./api";

const healthQueryKey = ["system", "health"] as const;
const content = zhCN.connection;

export function ConnectionStatusPage() {
  const detailsVisible = useAppUiStore(
    (state) => state.connectionDetailsVisible
  );
  const toggleDetails = useAppUiStore(
    (state) => state.toggleConnectionDetails
  );
  const healthQuery = useQuery({
    queryKey: healthQueryKey,
    queryFn: getHealth
  });

  const runtime = healthQuery.isSuccess ? getRuntimeConnection() : null;
  const statusLabel = healthQuery.isPending
    ? content.checking
    : healthQuery.isSuccess
      ? content.healthy
      : content.failed;
  const statusKind = healthQuery.isPending
    ? "checking"
    : healthQuery.isSuccess
      ? "healthy"
      : "failed";

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <section
        className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_16px_48px_rgb(36_54_40/0.08)]"
        aria-live="polite"
      >
        <p className="m-0 text-[13px] font-bold tracking-[0.08em] text-slate-500">
          {content.eyebrow}
        </p>
        <h1 className="mt-1 mb-6 text-2xl font-semibold text-slate-950">
          {content.title}
        </h1>
        <div className="mb-5 flex items-center gap-2.5 font-semibold">
          <span
            className={cn(
              "size-2.5 rounded-full bg-slate-400",
              statusKind === "healthy" && "bg-emerald-600",
              statusKind === "failed" && "bg-red-600"
            )}
            aria-hidden="true"
          />
          <span>{statusLabel}</span>
        </div>

        {healthQuery.isError ? (
          <>
            <p className="text-sm break-words text-red-700">
              {content.failedDescription}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void healthQuery.refetch()}
            >
              {content.retry}
            </Button>
          </>
        ) : null}

        {runtime === null ? null : (
          <>
            <Button type="button" variant="outline" onClick={toggleDetails}>
              {detailsVisible
                ? content.hideDetails
                : content.showDetails}
            </Button>
            {detailsVisible ? (
              <dl className="mt-5 grid gap-3 border-t border-slate-200 pt-5">
                <div className="grid gap-1">
                  <dt className="text-xs text-slate-500">
                    {content.apiVersion}
                  </dt>
                  <dd className="m-0 break-words font-mono">
                    {runtime.apiVersion}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-slate-500">
                    {content.serviceAddress}
                  </dt>
                  <dd className="m-0 break-words font-mono">
                    {runtime.baseUrl}
                  </dd>
                </div>
              </dl>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
