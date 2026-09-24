import { create } from "zustand";

interface AppUiState {
  readonly connectionDetailsVisible: boolean;
  readonly sidebarCollapsed: boolean;
  readonly toggleConnectionDetails: () => void;
  readonly toggleSidebar: () => void;
}

export const useAppUiStore = create<AppUiState>((set) => ({
  connectionDetailsVisible: false,
  sidebarCollapsed: false,
  toggleConnectionDetails: () =>
    set((state) => ({
      connectionDetailsVisible: !state.connectionDetailsVisible
    })),
  toggleSidebar: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed
    }))
}));
