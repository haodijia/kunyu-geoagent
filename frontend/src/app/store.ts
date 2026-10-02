import { create } from "zustand";

import {
  createMapContext,
  type MapContext,
  type MapViewport
} from "@/features/sessions/map-context";
import {
  readSidebarCollapsed,
  readSidebarWidth,
  readThemeMode,
  writeSidebarCollapsed,
  writeSidebarWidth,
  writeThemeMode,
  type ThemeMode
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
  readonly composerQueuedBySession: Readonly<Record<string, boolean>>;
  readonly mapContextBySession: Readonly<Record<string, MapContext>>;
  readonly modelSelectionBySession: Readonly<Record<string, SessionModelSelection>>;
  readonly sidebarCollapsed: boolean;
  readonly sidebarWidth: number;
  readonly themeMode: ThemeMode;
  readonly clearComposerDraft: (sessionId: string) => void;
  readonly initializeMapContext: (sessionId: string, workspaceId: string) => void;
  readonly setAnalysisMode: (sessionId: string, mode: AnalysisMode) => void;
  readonly setComposerDraft: (sessionId: string, draft: string) => void;
  readonly restoreComposerDraft: (sessionId: string, draft: string, map: MapContext, model: SessionModelSelection) => void;
  readonly setMapViewport: (
    sessionId: string,
    workspaceId: string,
    viewport: MapViewport
  ) => void;
  readonly setModelSelection: (
    sessionId: string,
    selection: SessionModelSelection
  ) => void;
  readonly setSidebarWidth: (width: number) => void;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setThemeMode: (mode: ThemeMode) => void;
  readonly toggleSidebar: () => void;
}

export const useAppUiStore = create<AppUiState>((set) => ({
  analysisModeBySession: {},
  composerDraftBySession: {},
  composerQueuedBySession: {},
  mapContextBySession: {},
  modelSelectionBySession: {},
  sidebarCollapsed: readSidebarCollapsed(),
  sidebarWidth: readSidebarWidth(),
  themeMode: readThemeMode(),
  clearComposerDraft: (sessionId) =>
    set((state) => ({
      composerDraftBySession: {
        ...state.composerDraftBySession,
        [sessionId]: ""
      },
      composerQueuedBySession: { ...state.composerQueuedBySession, [sessionId]: false },
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
      },
      composerQueuedBySession: { ...state.composerQueuedBySession, [sessionId]: draft.trim().length > 0 && state.composerQueuedBySession[sessionId] === true },
    })),
  restoreComposerDraft: (sessionId, draft, map, model) => set((state) => {
    const existing = state.composerDraftBySession[sessionId];
    if (existing !== undefined && existing.trim().length > 0) {
      throw new Error("A queued draft cannot replace existing composer input.");
    }
    return {
      composerDraftBySession: { ...state.composerDraftBySession, [sessionId]: draft },
      composerQueuedBySession: { ...state.composerQueuedBySession, [sessionId]: true },
      mapContextBySession: { ...state.mapContextBySession, [sessionId]: map },
      modelSelectionBySession: { ...state.modelSelectionBySession, [sessionId]: model },
    };
  }),
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
  setSidebarWidth: (width) => {
    const sidebarWidth = Math.min(400, Math.max(200, Math.round(width)));
    writeSidebarWidth(sidebarWidth);
    set({ sidebarWidth });
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    writeSidebarCollapsed(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
  setThemeMode: (themeMode) => {
    writeThemeMode(themeMode);
    set({ themeMode });
  },
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      writeSidebarCollapsed(sidebarCollapsed);
      return { sidebarCollapsed };
    })
}));
