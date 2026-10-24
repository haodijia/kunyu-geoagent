import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";

export function MapToolHint({
  map,
  children,
}: {
  readonly map: ReturnType<typeof useSessionMap>;
  readonly children: ReactNode;
}) {
  const container = map.getMap()?.getContainer().parentElement;
  return container == null
    ? null
    : createPortal(
        <div className="map-tool-hint" role="status">
          {children}
        </div>,
        container,
      );
}
