import { useQuery } from "@tanstack/react-query";
import { MapPinned, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { requestJson } from "@/api/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { MapViewport } from "@/features/sessions/map-context";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.map;
export function MapLocationLabel({ viewport }: { readonly viewport: MapViewport }) {
  const latitude = Number(viewport.latitude.toFixed(3));
  const longitude = Number(viewport.longitude.toFixed(3));
  const [point, setPoint] = useState({ latitude, longitude });
  useEffect(() => {
    const timer = setTimeout(() => setPoint({ latitude, longitude }), 650);
    return () => clearTimeout(timer);
  }, [latitude, longitude]);
  const location = useQuery({
    queryKey: ["map-location", point.latitude, point.longitude],
    queryFn: async ({ signal }) => {
      try {
        return await requestJson<{ readonly name: string | null }>(`/api/v1/map/location?latitude=${point.latitude}&longitude=${point.longitude}`, { signal });
      } catch (error) {
        if (!signal.aborted) console.error("[map] City lookup failed.", error);
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
  const moving = point.latitude !== latitude || point.longitude !== longitude;
  const label = moving || location.isPending ? content.cityLoading : location.isError ? content.cityFailed : location.data.name === null ? content.noCity : location.data.name;
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="inline-flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" title={label}>
        <MapPinned className="size-3.5 shrink-0" aria-hidden="true" /><span className="max-w-32 truncate">{label}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" className="w-64 space-y-2 p-3 text-xs">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{zhCN.conversation.mapViewport(viewport.longitude.toFixed(4), viewport.latitude.toFixed(4), viewport.zoom.toFixed(1))}</p>
      {location.isError && <Button size="sm" variant="ghost" onClick={() => void location.refetch()}><RotateCw className="size-3" />{content.retryCity}</Button>}
      <a className="block text-[10px] text-muted-foreground underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · Nominatim</a>
    </PopoverContent>
  </Popover>;
}
