import { MapPinned } from "lucide-react";
import OpenLayersMap from "ol/Map";
import View from "ol/View";
import { useEffect, useRef } from "react";

import "ol/ol.css";

import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function MapView() {
  const mapTargetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = mapTargetRef.current;
    if (target === null) {
      throw new Error("Map target element is required.");
    }

    const map = new OpenLayersMap({
      controls: [],
      layers: [],
      target,
      view: new View({
        center: [0, 0],
        zoom: 2
      })
    });
    const resizeObserver = new ResizeObserver(() => map.updateSize());
    resizeObserver.observe(target);

    return () => {
      resizeObserver.disconnect();
      map.setTarget(undefined);
    };
  }, []);

  return (
    <div className="relative h-full overflow-hidden bg-slate-100">
      <div ref={mapTargetRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white/95 px-7 py-6 text-center shadow-sm backdrop-blur">
          <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <MapPinned className="size-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <h1 className="m-0 text-base font-semibold tracking-tight text-slate-950">
            {content.mapEmptyTitle}
          </h1>
          <p className="mt-2 mb-0 text-sm leading-6 text-slate-500">
            {content.mapEmptyDescription}
          </p>
        </div>
      </div>
    </div>
  );
}
