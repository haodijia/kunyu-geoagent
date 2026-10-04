import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError } from "@/api/client";
import { streamSessionFollow } from "@/features/events/api";
import type { SessionEvent } from "@/features/events/api";
import {
  projectSessionEvent,
  type TrajectoryEventProjection,
} from "@/features/events/projection";
import { zhCN } from "@/locales/zh-CN";

import { LiveAssistantStream, type ActiveAssistant } from "./live-assistant";
import { projectPlanEvents, type PlanState } from "./plan";

const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8_000;

export type EventStreamStatus =
  "connecting" | "connected" | "reconnecting" | "failed";

interface SessionEventState {
  readonly plan: PlanState | null;
  readonly events: readonly SessionEvent[];
  readonly records: readonly TrajectoryEventProjection[];
  readonly activeAssistant: ActiveAssistant | null;
  readonly error: string | null;
  readonly status: EventStreamStatus;
}

const SessionEventContext = createContext<SessionEventState | null>(null);

interface SessionEventProviderProps {
  readonly children: ReactNode;
  readonly sessionId: string;
}

export function SessionEventProvider({
  children,
  sessionId,
}: SessionEventProviderProps) {
  const [records, setRecords] = useState<TrajectoryEventProjection[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [status, setStatus] = useState<EventStreamStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const lastSequenceRef = useRef(0);
  const [activeAssistant, setActiveAssistant] =
    useState<ActiveAssistant | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const cancelStream = () => controller.abort();
    window.addEventListener("beforeunload", cancelStream);
    const assistant = new LiveAssistantStream();
    let planState: PlanState = { active: false, pending: null };
    lastSequenceRef.current = 0;
    setActiveAssistant(null);
    setEvents([]);
    setPlan(null);
    setRecords([]);

    async function connect() {
      let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

      while (!controller.signal.aborted) {
        try {
          setStatus(
            lastSequenceRef.current === 0 ? "connecting" : "reconnecting",
          );
          setError(null);

          for await (const publication of streamSessionFollow(
            sessionId,
            lastSequenceRef.current,
            controller.signal,
            () => {
              if (!controller.signal.aborted) {
                setStatus("connected");
                setError(null);
              }
            },
          )) {
            if (controller.signal.aborted) return;
            if (publication.type === "assistant") {
              setActiveAssistant(
                assistant.accept(publication.frame, lastSequenceRef.current),
              );
            } else {
              const incoming =
                publication.type === "opened"
                  ? publication.events
                  : [publication.event];
              const projected: TrajectoryEventProjection[] = [];
              for (const event of incoming) {
                if (event.sequence !== lastSequenceRef.current + 1)
                  throw new Error(
                    zhCN.trajectory.sequenceGap(
                      lastSequenceRef.current + 1,
                      event.sequence,
                    ),
                  );
                assistant.durable(event);
                const projection = projectSessionEvent(event);
                if (projection !== null) projected.push(projection);
                lastSequenceRef.current = event.sequence;
              }
              if (incoming.length > 0) {
                planState = projectPlanEvents(planState, incoming);
                setPlan(planState);
                setEvents((current) => [...current, ...incoming].slice(-256));
                setRecords((current) => [...current, ...projected]);
              }
              if (publication.type === "opened")
                setActiveAssistant(
                  assistant.replace(publication.assistant, publication.cursor),
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
            sessionId,
            afterSequence: lastSequenceRef.current,
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
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        }
      }
    }

    void connect();
    return () => {
      window.removeEventListener("beforeunload", cancelStream);
      cancelStream();
    };
  }, [sessionId]);

  return (
    <SessionEventContext
      value={{ events, records, plan, activeAssistant, error, status }}
    >
      {children}
    </SessionEventContext>
  );
}

export function useSessionEvents(): SessionEventState {
  const state = useContext(SessionEventContext);
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
    signal.addEventListener("abort", finish, { once: true });
  });
}
