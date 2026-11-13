import { useMessages } from "@/features/messages/state/useMessages";
import {
  computed,
  defineComponent,
  inject,
  provide,
  type InjectionKey,
  type VNodeChild,
} from "vue";
const Context: InjectionKey<ReturnType<typeof useMessages> | null> =
  Symbol("Context");
export const SessionMessagesProvider = defineComponent(
  (
    componentProps: {
      readonly sessionId: string;
      readonly workspaceId: string;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      workspaceId = computed(() => componentProps.workspaceId),
      children = () => slots.default?.();
    const state = useMessages(
      () => sessionId.value,
      () => workspaceId.value,
    );
    provide(Context, state);
    return () => {
      return <>{children()}</>;
    };
  },
  {
    name: "SessionMessagesProvider",
    inheritAttrs: false,
    props: ["sessionId", "workspaceId"],
  },
);
export function useSessionMessages() {
  const state = inject(Context, null);
  if (state === null) throw new Error("SessionMessagesProvider is required.");
  return state;
}
