import type { MapPresentation } from "@/features/analysis/api";
import { useMapState } from "@/features/maps/runtime/usePersistentMap";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.mapConversation.presentation;

export function MapPresentationResult({ receipt, sessionId }: {
  readonly receipt: MapPresentation;
  readonly sessionId: string;
}) {
  const map = useMapState(sessionId);
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
