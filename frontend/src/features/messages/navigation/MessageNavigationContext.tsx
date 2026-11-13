import { useNavigation } from "@/app/navigation";
import {
  buildMessageAnchors,
  type MessageAnchor,
} from "@/features/messages/navigation/model";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import { refSetter } from "@/lib/lifecycle";
import {
  computed,
  defineComponent,
  inject,
  provide,
  reactive,
  shallowRef,
  toRefs,
  type InjectionKey,
  type VNodeChild,
} from "vue";
export interface MessageNavigation {
  readonly anchors: readonly MessageAnchor[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly searchOpen: boolean;
  readonly setSearchOpen: (value: boolean) => void;
  readonly pendingJump: {
    readonly id: number;
    readonly messageId: string;
  } | null;
  readonly jump: (messageId: string) => void;
  readonly acknowledge: (id: number) => void;
  readonly retry: () => void;
}
const NavigationContext: InjectionKey<MessageNavigation | null> =
  Symbol("NavigationContext");
export const MessageNavigationProvider = defineComponent(
  (
    _componentProps: {
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const children = () => slots.default?.();
    const session = useSessionWorkspace(),
      navigate = useNavigation();
    const { messagesQuery } = toRefs(useSessionMessages());
    const searchOpen = shallowRef(false),
      setSearchOpen = refSetter(searchOpen);
    const pendingJump = shallowRef<MessageNavigation["pendingJump"]>(null),
      setPendingJump = refSetter(pendingJump);
    const nextId = shallowRef(0);
    const anchors = computed(() =>
      messagesQuery.value.data === undefined
        ? []
        : buildMessageAnchors(messagesQuery.value.data),
    );
    const value = computed<MessageNavigation>(() => ({
      anchors: anchors.value,
      loading: messagesQuery.value.isPending,
      error: messagesQuery.value.error,
      searchOpen: searchOpen.value,
      setSearchOpen,
      pendingJump: pendingJump.value,
      jump: (messageId) => {
        if (!anchors.value.some((anchor) => anchor.messageId === messageId))
          throw new Error(
            "The message anchor does not belong to this session.",
          );
        setPendingJump({
          id: ++nextId.value,
          messageId,
        });
        setSearchOpen(false);
        void navigate(
          sessionAnalysisPath(session.workspace_id, session.id, "conversation"),
        );
      },
      acknowledge: (id) =>
        setPendingJump((current) => (current?.id === id ? null : current)),
      retry: () => {
        void messagesQuery.value.refetch();
      },
    }));
    provide(
      NavigationContext,
      reactive({
        get anchors() {
          return value.value.anchors;
        },
        get loading() {
          return value.value.loading;
        },
        get error() {
          return value.value.error;
        },
        get searchOpen() {
          return value.value.searchOpen;
        },
        get pendingJump() {
          return value.value.pendingJump;
        },
        setSearchOpen,
        jump: (id: string) => value.value.jump(id),
        acknowledge: (id: number) => value.value.acknowledge(id),
        retry: () => value.value.retry(),
      }),
    );
    return () => {
      return <>{children()}</>;
    };
  },
  {
    name: "MessageNavigationProvider",
    inheritAttrs: false,
    props: [],
  },
);
export function useMessageNavigation(): MessageNavigation {
  const context = inject(NavigationContext, null);
  if (context === null)
    throw new Error("Message navigation requires its session provider.");
  return context;
}
