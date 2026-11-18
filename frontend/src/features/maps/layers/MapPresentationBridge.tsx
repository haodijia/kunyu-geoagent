import { useNavigation } from "@/app/navigation";
import { useAppUiStore } from "@/app/store";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import type { MapBounds } from "@/features/sessions/map-context";
import { sessionMapPath } from "@/features/sessions/routes";
import { watchMounted } from "@/lib/lifecycle";
import { defineComponent, toRefs } from "vue";
import { useRoute } from "vue-router";

function isMapBounds(value: unknown): value is MapBounds {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (coordinate) =>
        typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  );
}

export const MapPresentationBridge = defineComponent(
  (_props, { slots: _slots }) => {
    const { events, records, replayCursor } = toRefs(useSessionEvents());
    const session = useSessionWorkspace();
    const navigate = useNavigation();
    const location = useRoute();
    const handled = new Set<string>();
    const ui = useAppUiStore();
    const mapPath = () => sessionMapPath(session.workspace_id, session.id);
    watchMounted(
      [() => events.value, () => records.value, () => replayCursor.value],
      () => {
        let openMap = false;
        for (const event of events.value) {
          if (
            event.sequence <= replayCursor.value ||
            event.event_type !== "tool.completed"
          )
            continue;
          const toolId = event.payload.tool_call_id;
          if (typeof toolId !== "string" || handled.has(toolId)) continue;
          const call = records.value.find(
            (record) =>
              record.eventType === "tool.requested" &&
              record.payload.tool_call_id === toolId,
          );
          if (call?.payload.name === "map_focus") {
            const result = event.payload.result;
            if (
              typeof result !== "object" ||
              result === null ||
              !("bounds" in result) ||
              !isMapBounds(result.bounds)
            )
              throw new Error("Invalid map focus result.");
            handled.add(toolId);
            ui.focusMap(session.id, result.bounds);
            openMap = true;
            continue;
          }
          if (call?.payload.name === "map_compare") {
            const result = event.payload.result;
            if (
              typeof result !== "object" ||
              result === null ||
              !("layer_ids" in result) ||
              !("open_map" in result) ||
              typeof result.open_map !== "boolean" ||
              (result.layer_ids !== null &&
                (!Array.isArray(result.layer_ids) ||
                  result.layer_ids.length !== 2 ||
                  !result.layer_ids.every((id) => typeof id === "string")))
            )
              throw new Error("Invalid map comparison result.");
            handled.add(toolId);
            ui.setMapComparison(
              session.id,
              result.layer_ids === null
                ? null
                : [result.layer_ids[0]!, result.layer_ids[1]!],
            );
            openMap ||= result.open_map;
            continue;
          }
          if (call?.payload.name !== "map_present") continue;
          const result = event.payload.result;
          if (
            typeof result !== "object" ||
            result === null ||
            !("layers" in result) ||
            !Array.isArray(result.layers) ||
            result.layers.length === 0
          )
            throw new Error("Invalid map presentation result.");
          const arguments_ = call.payload.arguments;
          if (
            typeof arguments_ !== "object" ||
            arguments_ === null ||
            !("open_map" in arguments_) ||
            typeof arguments_.open_map !== "boolean" ||
            !("focus" in arguments_) ||
            typeof arguments_.focus !== "boolean"
          )
            throw new Error("Invalid map presentation arguments.");
          let bounds: MapBounds | null = null;
          for (const layer of result.layers) {
            if (
              typeof layer !== "object" ||
              layer === null ||
              !("bounds" in layer)
            )
              throw new Error("Invalid presented layer.");
            const extent = layer.bounds;
            if (extent === null) continue;
            if (!isMapBounds(extent))
              throw new Error("Invalid presented layer bounds.");
            bounds =
              bounds === null
                ? [extent[0], extent[1], extent[2], extent[3]]
                : [
                    Math.min(bounds[0], extent[0]),
                    Math.min(bounds[1], extent[1]),
                    Math.max(bounds[2], extent[2]),
                    Math.max(bounds[3], extent[3]),
                  ];
          }
          handled.add(toolId);
          if (arguments_.focus && bounds !== null)
            ui.focusMap(session.id, bounds);
          openMap ||= arguments_.open_map;
        }
        if (openMap && location.path !== mapPath())
          void navigate(mapPath()).catch((error) => {
            console.error("[map] Navigation failed.", error);
          });
      },
    );
    return () => {
      return null;
    };
  },
  {
    name: "MapPresentationBridge",
    inheritAttrs: false,
    props: [],
  },
);
