import { useQuery } from "@tanstack/react-query";

import { connectionContent } from "../../app/content";
import { useAppUiStore } from "../../app/store";
import { getRuntimeConnection } from "../../api/runtime";
import { getHealth } from "./api";

const healthQueryKey = ["system", "health"] as const;

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
    ? connectionContent.checking
    : healthQuery.isSuccess
      ? connectionContent.healthy
      : connectionContent.failed;
  const statusKind = healthQuery.isPending
    ? "checking"
    : healthQuery.isSuccess
      ? "healthy"
      : "failed";

  return (
    <main className="connection-page">
      <section className="connection-card" aria-live="polite">
        <p className="connection-eyebrow">{connectionContent.eyebrow}</p>
        <h1>{connectionContent.title}</h1>
        <div className={`connection-status connection-status--${statusKind}`}>
          <span className="connection-status__indicator" aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>

        {healthQuery.isError ? (
          <>
            <p className="connection-error">{healthQuery.error.message}</p>
            <button type="button" onClick={() => void healthQuery.refetch()}>
              {connectionContent.retry}
            </button>
          </>
        ) : null}

        {runtime === null ? null : (
          <>
            <button type="button" onClick={toggleDetails}>
              {detailsVisible
                ? connectionContent.hideDetails
                : connectionContent.showDetails}
            </button>
            {detailsVisible ? (
              <dl className="connection-details">
                <div>
                  <dt>{connectionContent.apiVersion}</dt>
                  <dd>{runtime.apiVersion}</dd>
                </div>
                <div>
                  <dt>{connectionContent.serviceAddress}</dt>
                  <dd>{runtime.baseUrl}</dd>
                </div>
              </dl>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
