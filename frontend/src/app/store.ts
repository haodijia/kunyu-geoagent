import { create } from "zustand";

export type AnalysisMode = "conversation" | "trace";

interface AppUiState {
  readonly analysisModeBySession: Readonly<Record<string, AnalysisMode>>;
  readonly connectionDetailsVisible: boolean;
  readonly sidebarCollapsed: boolean;
  readonly setAnalysisMode: (sessionId: string, mode: AnalysisMode) => void;
  readonly toggleConnectionDetails: () => void;
  readonly toggleSidebar: () => void;
}

export const useAppUiStore = create<AppUiState>((set) => ({
  analysisModeBySession: {},
  connectionDetailsVisible: false,
  sidebarCollapsed: false,
  setAnalysisMode: (sessionId, mode) =>
    set((state) => ({
      analysisModeBySession: {
        ...state.analysisModeBySession,
        [sessionId]: mode
      }
    })),
  toggleConnectionDetails: () =>
    set((state) => ({
      connectionDetailsVisible: !state.connectionDetailsVisible
    })),
  toggleSidebar: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed
    }))
}));
