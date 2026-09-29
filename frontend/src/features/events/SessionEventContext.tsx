import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import { ApiError } from "@/api/client";
import { streamSessionEvents } from "@/features/events/api";
import type { SessionEvent } from "@/features/events/api";
import {
  projectSessionEvent,
  type TrajectoryEventProjection
} from "@/features/events/projection";
import { zhCN } from "@/locales/zh-CN";

const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8_000;

export type EventStreamStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

interface SessionEventState {
  readonly events: readonly SessionEvent[];
  readonly records: readonly TrajectoryEventProjection[];
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
  sessionId
}: SessionEventProviderProps) {
  const [records, setRecords] = useState<TrajectoryEventProjection[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [status, setStatus] = useState<EventStreamStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const lastSequenceRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    async function connect() {
      let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

      while (!controller.signal.aborted) {
        try {
          setStatus(lastSequenceRef.current === 0 ? "connecting" : "reconnecting");
          setError(null);

          for await (const event of streamSessionEvents(
            sessionId,
            lastSequenceRef.current,
            controller.signal,
            () => { if (!controller.signal.aborted) { setStatus("connected"); setError(null); } }
          )) {
            if (controller.signal.aborted) return;
            if (event.sequence <= lastSequenceRef.current) {
              continue;
            }
            if (event.sequence !== lastSequenceRef.current + 1) {
              throw new Error(
                zhCN.trajectory.sequenceGap(lastSequenceRef.current + 1, event.sequence)
              );
            }

            const projection = projectSessionEvent(event);
            lastSequenceRef.current = event.sequence;
            setEvents((current) => [...current, event].slice(-256));
            if (projection !== null) {
              setRecords((current) => [...current, projection]);
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
            afterSequence: lastSequenceRef.current
          });

          if (isTerminalError(streamError)) {
            setError(streamError.message);
            setStatus("failed");
            return;
          }

          setStatus("reconnecting");
          setError(
            streamError instanceof Error
              ? streamError.message
              : zhCN.trajectory.streamConnectionFailed
          );
          await waitForReconnect(reconnectDelay, controller.signal);
          reconnectDelay = Math.min(
            reconnectDelay * 2,
            MAX_RECONNECT_DELAY_MS
          );
        }
      }
    }

    void connect();
    return () => controller.abort();
  }, [sessionId]);

  return (
    <SessionEventContext value={{ events, records, error, status }}>
      {children}
    </SessionEventContext>
  );
}

export function useSessionEvents(): SessionEventState {
  const state = useContext(SessionEventContext);
  if (state === null) {
    throw new Error("useSessionEvents must be used inside SessionEventProvider.");
  }
  return state;
}

function isTerminalError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

function waitForReconnect(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, delay);
    signal.addEventListener("abort", finish, { once: true });
  });
}
