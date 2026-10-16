import { create } from "zustand";
import type { Attachment } from "@/features/attachments/api";
import type { ReplyQuote } from "@/features/messages/reply-quote";

import {
  createMapContext,
  type MapCamera,
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
  readonly composerAttachmentsBySession: Readonly<Record<string, readonly Attachment[]>>;
  readonly setComposerAttachments: (sessionId: string, attachments: readonly Attachment[]) => void;
  readonly composerDraftBySession: Readonly<Record<string, string>>;
  readonly composerQuoteBySession: Readonly<Record<string, ReplyQuote | null>>;
  readonly setComposerQuote: (sessionId: string, quote: ReplyQuote | null) => void;
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
  readonly restoreComposerDraft: (sessionId: string, draft: string, map: MapContext, model: SessionModelSelection, attachments: readonly Attachment[]) => void;
  readonly setMapView: (
    sessionId: string,
    viewport: MapViewport,
    camera: MapCamera
  ) => void;
  readonly setMapImageSelection: (sessionId: string, selection: MapContext["imageSelection"]) => void;
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
  composerQuoteBySession: {},
  setComposerQuote: (sessionId, quote) => set((state) => ({ composerQuoteBySession: { ...state.composerQuoteBySession, [sessionId]: quote } })),
  composerAttachmentsBySession: {},
  setComposerAttachments: (sessionId, attachments) => set((state) => ({ composerAttachmentsBySession: { ...state.composerAttachmentsBySession, [sessionId]: attachments } })),
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
      composerQuoteBySession: { ...state.composerQuoteBySession, [sessionId]: null },
      composerAttachmentsBySession: { ...state.composerAttachmentsBySession, [sessionId]: [] },
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
      composerQueuedBySession: { ...state.composerQueuedBySession, [sessionId]: (draft.trim().length > 0 || (state.composerAttachmentsBySession[sessionId]?.length ?? 0) > 0) && state.composerQueuedBySession[sessionId] === true },
    })),
  restoreComposerDraft: (sessionId, draft, map, model, attachments) => set((state) => {
    const existing = state.composerDraftBySession[sessionId];
    if ((existing !== undefined && existing.trim().length > 0) || state.composerQuoteBySession[sessionId] != null || (state.composerAttachmentsBySession[sessionId]?.length ?? 0) > 0) {
      throw new Error("A queued draft cannot replace existing composer input.");
    }
    return {
      composerDraftBySession: { ...state.composerDraftBySession, [sessionId]: draft },
      composerQueuedBySession: { ...state.composerQueuedBySession, [sessionId]: true },
      composerAttachmentsBySession: { ...state.composerAttachmentsBySession, [sessionId]: attachments },
      mapContextBySession: { ...state.mapContextBySession, [sessionId]: map },
      modelSelectionBySession: { ...state.modelSelectionBySession, [sessionId]: model },
    };
  }),
  setMapImageSelection: (sessionId, imageSelection) => set(state => {
    const current = state.mapContextBySession[sessionId];
    if (current === undefined) throw new Error("Map context must be initialized before selecting imagery.");
    return {mapContextBySession: {...state.mapContextBySession, [sessionId]: {...current, imageSelection}}};
  }),
  setMapView: (sessionId, viewport, camera) =>
    set((state) => {
      const current = state.mapContextBySession[sessionId];
      if (current === undefined) {
        throw new Error("Map context must be initialized before updating its view.");
      }
      return {
        mapContextBySession: {
          ...state.mapContextBySession,
          [sessionId]: {
            ...current,
            viewport,
            camera
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
