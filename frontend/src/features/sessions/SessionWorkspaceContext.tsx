import type { SessionSummary } from "@/features/sessions/api";
import {
  computed,
  defineComponent,
  inject,
  provide,
  reactive,
  type InjectionKey,
  type VNodeChild,
} from "vue";
const SessionWorkspaceContext: InjectionKey<SessionSummary | null> = Symbol(
  "SessionWorkspaceContext",
);
interface SessionWorkspaceProviderProps {
  readonly children?: VNodeChild;
  readonly session: SessionSummary;
}
export const SessionWorkspaceProvider = defineComponent(
  (componentProps: SessionWorkspaceProviderProps, { slots }) => {
    const children = () => slots.default?.(),
      session = computed(() => componentProps.session);
    provide(
      SessionWorkspaceContext,
      reactive({
        get id() {
          return session.value.id;
        },
        get workspace_id() {
          return session.value.workspace_id;
        },
        get title() {
          return session.value.title;
        },
        get archived() {
          return session.value.archived;
        },
        get created_at() {
          return session.value.created_at;
        },
        get updated_at() {
          return session.value.updated_at;
        },
      }),
    );
    return () => {
      return <>{children()}</>;
    };
  },
  {
    name: "SessionWorkspaceProvider",
    inheritAttrs: false,
    props: ["session"],
  },
);
export function useSessionWorkspace(): SessionSummary {
  const session = inject(SessionWorkspaceContext, null);
  if (session === null) {
    throw new Error(
      "useSessionWorkspace must be used inside SessionWorkspaceProvider.",
    );
  }
  return session;
}
