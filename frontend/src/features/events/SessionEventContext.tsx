import { ApiError } from "@/api/client";
import type { SessionEvent } from "@/features/events/api";
import { streamSessionFollow } from "@/features/events/api";
import {
  projectSessionEvent,
  type TrajectoryEventProjection,
} from "@/features/events/projection/events";
import {
  projectPlanEvents,
  type PlanState,
} from "@/features/events/projection/plan";
import {
  LiveAssistantStream,
  type ActiveAssistant,
} from "@/features/events/stream/live-assistant";
import { respondToMapCapture } from "@/features/maps/runtime/map-capture";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import {
  computed,
  defineComponent,
  inject,
  provide,
  reactive,
  shallowRef,
  type InjectionKey,
  type VNodeChild,
} from "vue";
const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8_000;
export type EventStreamStatus =
  "connecting" | "connected" | "reconnecting" | "failed";
interface SessionEventState {
  readonly replayCursor: number;
  readonly plan: PlanState | null;
  readonly events: readonly SessionEvent[];
  readonly records: readonly TrajectoryEventProjection[];
  readonly activeAssistant: ActiveAssistant | null;
  readonly error: string | null;
  readonly status: EventStreamStatus;
}
const SessionEventContext: InjectionKey<SessionEventState | null> = Symbol(
  "SessionEventContext",
);
interface SessionEventProviderProps {
  readonly children?: VNodeChild;
  readonly sessionId: string;
}
export const SessionEventProvider = defineComponent(
  (componentProps: SessionEventProviderProps, { slots }) => {
    const children = () => slots.default?.(),
      sessionId = computed(() => componentProps.sessionId);
    const records = shallowRef<TrajectoryEventProjection[]>([]),
      setRecords = refSetter(records);
    const events = shallowRef<SessionEvent[]>([]),
      setEvents = refSetter(events);
    const plan = shallowRef<PlanState | null>(null),
      setPlan = refSetter(plan);
    const status = shallowRef<EventStreamStatus>("connecting"),
      setStatus = refSetter(status);
    const error = shallowRef<string | null>(null),
      setError = refSetter(error);
    const replayCursor = shallowRef(Number.POSITIVE_INFINITY),
      setReplayCursor = refSetter(replayCursor);
    const lastSequenceRef = shallowRef(0);
    const activeAssistant = shallowRef<ActiveAssistant | null>(null),
      setActiveAssistant = refSetter(activeAssistant);
    watchMounted([() => sessionId.value], () => {
      const controller = new AbortController();
      const cancelStream = () => controller.abort();
      window.addEventListener("beforeunload", cancelStream);
      const assistant = new LiveAssistantStream();
      let planState: PlanState = {
        active: false,
        pending: null,
      };
      lastSequenceRef.value = 0;
      setActiveAssistant(null);
      setEvents([]);
      setPlan(null);
      setRecords([]);
      setReplayCursor(Number.POSITIVE_INFINITY);
      async function connect() {
        let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        while (!controller.signal.aborted) {
          try {
            setStatus(
              lastSequenceRef.value === 0 ? "connecting" : "reconnecting",
            );
            setError(null);
            for await (const publication of streamSessionFollow(
              sessionId.value,
              lastSequenceRef.value,
              controller.signal,
              () => {
                if (!controller.signal.aborted) {
                  setStatus("connected");
                  setError(null);
                }
              },
            )) {
              if (controller.signal.aborted) return;
              if (publication.type === "map_capture") {
                void respondToMapCapture(
                  sessionId.value,
                  publication.requestId,
                  controller.signal,
                ).catch((error) => {
                  if (!controller.signal.aborted)
                    console.error("[map] Screenshot response failed.", {
                      sessionId: sessionId.value,
                      requestId: publication.requestId,
                      error,
                    });
                });
                continue;
              }
              if (publication.type === "assistant") {
                setActiveAssistant(
                  assistant.accept(publication.frame, lastSequenceRef.value),
                );
              } else {
                if (
                  publication.type === "opened" &&
                  replayCursor.value === Number.POSITIVE_INFINITY
                )
                  setReplayCursor(publication.cursor);
                const incoming =
                  publication.type === "opened"
                    ? publication.events
                    : [publication.event];
                const projected: TrajectoryEventProjection[] = [];
                for (const event of incoming) {
                  if (event.sequence !== lastSequenceRef.value + 1)
                    throw new Error(
                      zhCN.trajectory.sequenceGap(
                        lastSequenceRef.value + 1,
                        event.sequence,
                      ),
                    );
                  assistant.durable(event);
                  const projection = projectSessionEvent(event);
                  if (projection !== null) projected.push(projection);
                  lastSequenceRef.value = event.sequence;
                }
                if (incoming.length > 0) {
                  planState = projectPlanEvents(planState, incoming);
                  setPlan(planState);
                  setEvents((current) => [...current, ...incoming].slice(-256));
                  setRecords((current) => [...current, ...projected]);
                }
                if (publication.type === "opened")
                  setActiveAssistant(
                    assistant.replace(
                      publication.assistant,
                      publication.cursor,
                    ),
                  );
              }
              setStatus("connected");
              reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            }
            if (!controller.signal.aborted) {
              throw new Error(zhCN.trajectory.streamEnded);
            }
          } catch (streamError) {
            if (controller.signal.aborted) {
              return;
            }
            console.error("[events] Session event stream disconnected.", {
              error: streamError,
              sessionId: sessionId.value,
              afterSequence: lastSequenceRef.value,
            });
            if (isTerminalError(streamError)) {
              setError(streamError.message);
              setStatus("failed");
              return;
            }
            setStatus("reconnecting");
            setError(
              streamError instanceof ApiError
                ? streamError.message
                : zhCN.trajectory.streamConnectionFailed,
            );
            await waitForReconnect(reconnectDelay, controller.signal);
            reconnectDelay = Math.min(
              reconnectDelay * 2,
              MAX_RECONNECT_DELAY_MS,
            );
          }
        }
      }
      void connect();
      return () => {
        window.removeEventListener("beforeunload", cancelStream);
        cancelStream();
      };
    });
    provide(
      SessionEventContext,
      reactive({
        get events() {
          return events.value;
        },
        get records() {
          return records.value;
        },
        get plan() {
          return plan.value;
        },
        get activeAssistant() {
          return activeAssistant.value;
        },
        get error() {
          return error.value;
        },
        get status() {
          return status.value;
        },
        get replayCursor() {
          return replayCursor.value;
        },
      }),
    );
    return () => {
      return <>{children()}</>;
    };
  },
  {
    name: "SessionEventProvider",
    inheritAttrs: false,
    props: ["sessionId"],
  },
);
export function useSessionEvents(): SessionEventState {
  const state = inject(SessionEventContext, null);
  if (state === null) {
    throw new Error(
      "useSessionEvents must be used inside SessionEventProvider.",
    );
  }
  return state;
}
function isTerminalError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}
function waitForReconnect(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, delay);
    signal.addEventListener("abort", finish, {
      once: true,
    });
  });
}
