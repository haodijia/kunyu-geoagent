import type { SessionEvent } from "./api";

export interface PlanState {
  readonly active: boolean;
  readonly pending: boolean | null;
}

export function projectPlanEvents(state: PlanState, events: readonly SessionEvent[]): PlanState {
  let current = state;
  for (const event of events) {
    if (event.event_type === "plan/changed" || event.event_type === "plan/selected") {
      const active = event.payload.active;
      if (typeof active !== "boolean") throw new Error("Invalid plan selection.");
      current = event.event_type === "plan/changed"
        ? { active, pending: null }
        : { ...current, pending: active === current.active ? null : active };
    } else if (event.event_type === "agent/step/decision" && event.payload.kind === "enter" && current.pending !== null) {
      current = { active: current.pending, pending: null };
    }
  }
  return current;
}
