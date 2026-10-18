import type { MapPresentation } from "@/features/analysis/api";
import { useMapState } from "@/features/maps/runtime/usePersistentMap";
import { zhCN } from "@/locales/zh-CN";

type PresentationReceipt = Pick<MapPresentation, "request_id" | "status" | "target" | "error">;
const content = zhCN.mapConversation.presentation;

export function MapPresentationResult({ value, sessionId }: {
  readonly value: unknown;
  readonly sessionId: string;
}) {
  const map = useMapState(sessionId);
  const receipt = parseReceipt(value);
  const current = map.data?.presentation;
  const presentation = current?.request_id === receipt.request_id ? current : receipt;
  return <div className="space-y-1 text-xs leading-5" role="status">
    <p className={presentation.status === "failed" ? "text-destructive" : "text-secondary-foreground"}>
      {content[presentation.status][presentation.target]}
    </p>
    {presentation.status === "failed" && presentation.error !== null && <p className="text-destructive">{presentation.error}</p>}
    {map.isError && <p role="alert" className="text-warning">{content.readFailed}</p>}
  </div>;
}

function parseReceipt(value: unknown): PresentationReceipt {
  if (typeof value !== "object" || value === null || !("presentation" in value))
    throw new Error("Map tool result has no presentation receipt.");
  const receipt = value.presentation;
  if (typeof receipt !== "object" || receipt === null ||
    !("request_id" in receipt) || typeof receipt.request_id !== "string" ||
    !("status" in receipt) || (receipt.status !== "requested" && receipt.status !== "applied" && receipt.status !== "failed") ||
    !("target" in receipt) || (receipt.target !== "candidates" && receipt.target !== "output") ||
    !("error" in receipt) || (receipt.error !== null && typeof receipt.error !== "string"))
    throw new Error("Invalid map presentation receipt.");
  return { request_id: receipt.request_id, status: receipt.status, target: receipt.target, error: receipt.error };
}
