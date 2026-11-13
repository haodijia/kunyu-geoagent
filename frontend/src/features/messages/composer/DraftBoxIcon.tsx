import { computed, defineComponent } from "vue";
export const DraftBoxIcon = defineComponent(
  (
    componentProps: {
      readonly size?: number;
    },
    { slots: _slots },
  ) => {
    const size = computed(() =>
      componentProps.size === undefined ? 16 : componentProps.size,
    );
    return () => {
      const _size = size.value;
      return (
        <svg
          width={_size}
          height={_size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7 4.5h10l2 7.5v5.2A2.8 2.8 0 0 1 16.2 20H7.8A2.8 2.8 0 0 1 5 17.2V12l2-7.5Z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M5.4 12h4l1.4 2h2.4l1.4-2h4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M12 5.5v6.2m0 0 2.5-2.5M12 11.7 9.5 9.2"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      );
    };
  },
  {
    name: "DraftBoxIcon",
    inheritAttrs: false,
    props: ["size"],
  },
);
