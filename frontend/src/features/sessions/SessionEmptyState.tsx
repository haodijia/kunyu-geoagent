import type { LucideIcon } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
interface SessionEmptyStateProps {
  readonly description: string;
  readonly icon: LucideIcon;
  readonly title: string;
}
export const SessionEmptyState = defineComponent(
  (componentProps: SessionEmptyStateProps, { slots: _slots }) => {
    const description = computed(() => componentProps.description),
      Icon = computed(() => componentProps.icon),
      title = computed(() => componentProps.title);
    return () => {
      const _title = title.value,
        _description = description.value;
      return (
        <div class="flex h-full items-center justify-center px-8 py-12">
          <div class="max-w-sm text-center">
            <span class="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-secondary-foreground">
              <Icon.value class="size-5" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <h1 class="m-0 text-base font-semibold tracking-normal text-foreground">
              {_title}
            </h1>
            <p class="mt-2 mb-0 text-sm leading-6 text-muted-foreground">
              {_description}
            </p>
          </div>
        </div>
      );
    };
  },
  {
    name: "SessionEmptyState",
    inheritAttrs: false,
    props: ["description", "icon", "title"],
  },
);
