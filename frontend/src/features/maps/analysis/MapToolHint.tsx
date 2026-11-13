import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { computed, defineComponent, Teleport, type VNodeChild } from "vue";
export const MapToolHint = defineComponent(
  (
    componentProps: {
      readonly map: ReturnType<typeof useSessionMap>;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const map = computed(() => componentProps.map),
      children = () => slots.default?.();
    const container = computed(
      () => map.value.getMap()?.getContainer().parentElement,
    );
    return () => {
      const _container = container.value;
      return _container == null ? null : (
        <Teleport to={_container}>
          {
            <div class="map-tool-hint" role="status">
              {children()}
            </div>
          }
        </Teleport>
      );
    };
  },
  {
    name: "MapToolHint",
    inheritAttrs: false,
    props: ["map"],
  },
);
