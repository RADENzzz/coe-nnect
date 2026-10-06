import { create } from 'zustand';

interface UiState {
  isMobileDrawerOpen: boolean;
  lastPath: string | null;
  openMobileDrawer: () => void;
  closeMobileDrawer: () => void;
  toggleMobileDrawer: () => void;
  setLastPath: (path: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  isMobileDrawerOpen: false,
  lastPath: null,

  openMobileDrawer: () => set({ isMobileDrawerOpen: true }),
  closeMobileDrawer: () => set({ isMobileDrawerOpen: false }),
  toggleMobileDrawer: () =>
    set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),

  setLastPath: (path) => {
    // Auto-close the drawer whenever the route changes.
    if (get().lastPath !== path && get().isMobileDrawerOpen) {
      set({ isMobileDrawerOpen: false, lastPath: path });
    } else {
      set({ lastPath: path });
    }
  },
}));