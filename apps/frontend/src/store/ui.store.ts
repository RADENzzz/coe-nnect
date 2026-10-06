import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  isMobileDrawerOpen: boolean;
  isSidebarCollapsed: boolean;
  /** Set true whenever the user manually toggles the sidebar.
   *  Prevents the viewport auto-collapse effect from overriding
   *  the user's choice. */
  userOverrodeSidebar: boolean;
  lastPath: string | null;
  openMobileDrawer: () => void;
  closeMobileDrawer: () => void;
  toggleMobileDrawer: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLastPath: (path: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      isMobileDrawerOpen: false,
      isSidebarCollapsed: false,
      userOverrodeSidebar: false,
      lastPath: null,

      openMobileDrawer: () => set({ isMobileDrawerOpen: true }),
      closeMobileDrawer: () => set({ isMobileDrawerOpen: false }),
      toggleMobileDrawer: () =>
        set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),

      // Manual toggle marks user override
      toggleSidebar: () =>
        set((state) => ({
          isSidebarCollapsed: !state.isSidebarCollapsed,
          userOverrodeSidebar: true,
        })),

      // Programmatic set (from AppShell) does NOT mark user override
      setSidebarCollapsed: (collapsed) =>
        set({ isSidebarCollapsed: collapsed }),

      setLastPath: (path) => {
        if (get().lastPath !== path && get().isMobileDrawerOpen) {
          set({ isMobileDrawerOpen: false, lastPath: path });
        } else {
          set({ lastPath: path });
        }
      },
    }),
    {
      name: 'coe-nnect-ui',
      // Only persist the collapsed preference — never the drawer or path
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        userOverrodeSidebar: state.userOverrodeSidebar,
      }),
    },
  ),
);