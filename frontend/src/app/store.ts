import { create } from "zustand";

interface AppUiState {
  readonly connectionDetailsVisible: boolean;
  readonly toggleConnectionDetails: () => void;
}

export const useAppUiStore = create<AppUiState>((set) => ({
  connectionDetailsVisible: false,
  toggleConnectionDetails: () =>
    set((state) => ({
      connectionDetailsVisible: !state.connectionDetailsVisible
    }))
}));
