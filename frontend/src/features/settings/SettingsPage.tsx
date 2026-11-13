import { computed, defineComponent, type VNodeChild } from "vue";
export const SettingsPageWrapper = defineComponent(
  (
    _componentProps: {
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const children = () => slots.default?.();
    return () => {
      return (
        <div class="settings-page-wrapper box-border min-h-full w-full overflow-y-auto bg-[var(--bg-1)] px-[16px] md:px-[32px]">
          <div class="settings-page-content mx-auto w-full pt-[16px] pb-[16px] md:max-w-[880px] md:pt-[24px] md:pb-[24px]">
            {children()}
          </div>
        </div>
      );
    };
  },
  {
    name: "SettingsPageWrapper",
    inheritAttrs: false,
    props: [],
  },
);
export const SettingsPageHeader = defineComponent(
  (
    componentProps: {
      readonly title: string;
      readonly description: string;
      readonly actions: VNodeChild;
      readonly navigation?: VNodeChild;
    },
    { slots: _slots },
  ) => {
    const title = computed(() => componentProps.title),
      description = computed(() => componentProps.description),
      actions = computed(() => componentProps.actions),
      navigation = computed(() => componentProps.navigation);
    return () => {
      const _navigation = navigation.value,
        _title = title.value,
        _actions = actions.value,
        _description = description.value;
      return (
        <div class="sticky top-0 z-10 -mt-[16px] bg-[var(--bg-1)] pt-[16px] md:-mt-[24px] md:pt-[24px]">
          {_navigation ? <div class="mb-4">{_navigation}</div> : null}
          <div class="flex min-h-[34px] flex-wrap items-center justify-between gap-[8px] sm:gap-[16px]">
            <h1 class="m-0 min-w-0 flex-1 text-[18px] leading-[1.3] font-semibold text-t-primary [overflow-wrap:anywhere] md:text-[20px]">
              {_title}
            </h1>
            {_actions ? (
              <div class="flex max-w-full flex-wrap items-center justify-end gap-[8px]">
                {_actions}
              </div>
            ) : null}
          </div>
          <p
            class="m-0 mt-[8px] text-[13px] leading-relaxed text-t-secondary"
            style={{
              textWrap: "balance",
            }}
          >
            {_description}
          </p>
        </div>
      );
    };
  },
  {
    name: "SettingsPageHeader",
    inheritAttrs: false,
    props: ["title", "description", "actions", "navigation"],
  },
);
