import { create } from "zustand";

import {
  createMapContext,
  type MapContext,
  type MapViewport
} from "@/features/sessions/map-context";

export type AnalysisMode = "conversation" | "trace";

interface AppUiState {
  readonly analysisModeBySession: Readonly<Record<string, AnalysisMode>>;
  readonly composerDraftBySession: Readonly<Record<string, string>>;
  readonly connectionDetailsVisible: boolean;
  readonly mapContextBySession: Readonly<Record<string, MapContext>>;
  readonly sidebarCollapsed: boolean;
  readonly clearComposerDraft: (sessionId: string) => void;
  readonly initializeMapContext: (sessionId: string, workspaceId: string) => void;
  readonly setAnalysisMode: (sessionId: string, mode: AnalysisMode) => void;
  readonly setComposerDraft: (sessionId: string, draft: string) => void;
  readonly setMapViewport: (
    sessionId: string,
    workspaceId: string,
    viewport: MapViewport
  ) => void;
  readonly toggleConnectionDetails: () => void;
  readonly toggleSidebar: () => void;
}

export const useAppUiStore = create<AppUiState>((set) => ({
  analysisModeBySession: {},
  composerDraftBySession: {},
  connectionDetailsVisible: false,
  mapContextBySession: {},
  sidebarCollapsed: false,
  clearComposerDraft: (sessionId) =>
    set((state) => ({
      composerDraftBySession: {
        ...state.composerDraftBySession,
        [sessionId]: ""
      }
    })),
  initializeMapContext: (sessionId, workspaceId) =>
    set((state) => {
      if (state.mapContextBySession[sessionId] !== undefined) {
        return state;
      }
      return {
        mapContextBySession: {
          ...state.mapContextBySession,
          [sessionId]: createMapContext(workspaceId)
        }
      };
    }),
  setAnalysisMode: (sessionId, mode) =>
    set((state) => ({
      analysisModeBySession: {
        ...state.analysisModeBySession,
        [sessionId]: mode
      }
    })),
  setComposerDraft: (sessionId, draft) =>
    set((state) => ({
      composerDraftBySession: {
        ...state.composerDraftBySession,
        [sessionId]: draft
      }
    })),
  setMapViewport: (sessionId, workspaceId, viewport) =>
    set((state) => {
      const current = state.mapContextBySession[sessionId] ?? createMapContext(workspaceId);
      return {
        mapContextBySession: {
          ...state.mapContextBySession,
          [sessionId]: {
            ...current,
            viewport
          }
        }
      };
    }),
  toggleConnectionDetails: () =>
    set((state) => ({
      connectionDetailsVisible: !state.connectionDetailsVisible
    })),
  toggleSidebar: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed
    }))
}));
