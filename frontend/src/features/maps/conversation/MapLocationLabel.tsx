import { requestJson } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { MapViewport } from "@/features/sessions/map-context";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import { MapPinned, RotateCw } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
const content = zhCN.map;
export const MapLocationLabel = defineComponent(
  (
    componentProps: {
      readonly viewport: MapViewport;
    },
    { slots: _slots },
  ) => {
    const viewport = computed(() => componentProps.viewport);
    const latitude = computed(() => Number(viewport.value.latitude.toFixed(3)));
    const longitude = computed(() =>
      Number(viewport.value.longitude.toFixed(3)),
    );
    const point = shallowRef({
        latitude: latitude.value,
        longitude: longitude.value,
      }),
      setPoint = refSetter(point);
    watchMounted([() => latitude.value, () => longitude.value], () => {
      const timer = setTimeout(
        () =>
          setPoint({
            latitude: latitude.value,
            longitude: longitude.value,
          }),
        650,
      );
      return () => clearTimeout(timer);
    });
    const location = reactive(
      useQuery(
        computed(() => ({
          queryKey: [
            "map-location",
            point.value.latitude,
            point.value.longitude,
          ],
          queryFn: async ({ signal }: { signal: AbortSignal }) => {
            try {
              return await requestJson<{
                readonly name: string | null;
              }>(
                `/api/v1/map/location?latitude=${point.value.latitude}&longitude=${point.value.longitude}`,
                {
                  signal,
                },
              );
            } catch (error) {
              if (!signal.aborted)
                console.error("[map] City lookup failed.", error);
              throw error;
            }
          },
          staleTime: Infinity,
          retry: false,
        })),
      ),
    );
    const moving = computed(
      () =>
        point.value.latitude !== latitude.value ||
        point.value.longitude !== longitude.value,
    );
    const label = computed(() =>
      moving.value || location.isPending
        ? content.cityLoading
        : location.isError
          ? content.cityFailed
          : location.data.name === null
            ? content.noCity
            : location.data.name,
    );
    return () => {
      const _label = label.value,
        _viewport = viewport.value;
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              class="inline-flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              title={_label}
            >
              <MapPinned class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="max-w-32 truncate">{_label}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            class="w-64 space-y-2 p-3 text-xs"
          >
            <p class="font-medium">{_label}</p>
            <p class="text-muted-foreground">
              {zhCN.conversation.mapViewport(
                _viewport.longitude.toFixed(4),
                _viewport.latitude.toFixed(4),
                _viewport.zoom.toFixed(1),
              )}
            </p>
            {location.isError && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void location.refetch()}
              >
                <RotateCw class="size-3" />
                {content.retryCity}
              </Button>
            )}
            <a
              class="block text-[10px] text-muted-foreground underline"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors · Nominatim
            </a>
          </PopoverContent>
        </Popover>
      );
    };
  },
  {
    name: "MapLocationLabel",
    inheritAttrs: false,
    props: ["viewport"],
  },
);
