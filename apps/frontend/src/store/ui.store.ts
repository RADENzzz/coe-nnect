import { create } from 'zustand';

interface UiState {
  isMobileDrawerOpen: boolean;
  isSidebarCollapsed: boolean;
  lastPath: string | null;
  openMobileDrawer: () => void;
  closeMobileDrawer: () => void;
  toggleMobileDrawer: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLastPath: (path: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  isMobileDrawerOpen: false,
  isSidebarCollapsed: false,
  lastPath: null,

  openMobileDrawer: () => set({ isMobileDrawerOpen: true }),
  closeMobileDrawer: () => set({ isMobileDrawerOpen: false }),
  toggleMobileDrawer: () =>
    set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),

  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),

  setLastPath: (path) => {
    if (get().lastPath !== path && get().isMobileDrawerOpen) {
      set({ isMobileDrawerOpen: false, lastPath: path });
    } else {
      set({ lastPath: path });
    }
  },
}));