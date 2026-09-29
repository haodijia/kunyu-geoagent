import { create } from "zustand";

import {
  createMapContext,
  type MapContext,
  type MapViewport
} from "@/features/sessions/map-context";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed
} from "@/app/storage";

export type AnalysisMode = "conversation" | "trace";

export interface SessionModelSelection {
  readonly connectionId: string;
  readonly modelId: string;
  readonly reasoningEffort: string | null;
}

interface AppUiState {
  readonly analysisModeBySession: Readonly<Record<string, AnalysisMode>>;
  readonly composerDraftBySession: Readonly<Record<string, string>>;
  readonly mapContextBySession: Readonly<Record<string, MapContext>>;
  readonly modelSelectionBySession: Readonly<Record<string, SessionModelSelection>>;
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
  readonly setModelSelection: (
    sessionId: string,
    selection: SessionModelSelection
  ) => void;
  readonly toggleSidebar: () => void;
}

export const useAppUiStore = create<AppUiState>((set) => ({
  analysisModeBySession: {},
  composerDraftBySession: {},
  mapContextBySession: {},
  modelSelectionBySession: {},
  sidebarCollapsed: readSidebarCollapsed(),
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
  setModelSelection: (sessionId, selection) =>
    set((state) => ({
      modelSelectionBySession: {
        ...state.modelSelectionBySession,
        [sessionId]: selection
      }
    })),
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      writeSidebarCollapsed(sidebarCollapsed);
      return { sidebarCollapsed };
    })
}));
