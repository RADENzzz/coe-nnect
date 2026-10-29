import { create } from 'zustand';

export const SIDEBAR_PIN_STORAGE_KEY = 'coe-nnect:sidebar-pinned';

/**
 * How the sidebar rail behaves.
 * - `auto`   — expands on hover, collapses when the pointer leaves.
 * - `open`   — locked open; never auto-collapses.
 * - `closed` — locked shut; hovering does not expand it (an explicit
 *              click on the expand chevron still does, until the pointer
 *              leaves).
 */
export type SidebarPin = 'auto' | 'open' | 'closed';

function readStoredPin(): SidebarPin {
  try {
    const stored = localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY);
    if (stored === 'open' || stored === 'closed' || stored === 'auto') {
      return stored;
    }
    // Earlier builds stored a boolean.
    if (stored === 'true') return 'open';
    return 'auto';
  } catch {
    /* Storage can be unavailable in private mode. */
    return 'auto';
  }
}

interface UiState {
  isMobileDrawerOpen: boolean;
  isSidebarCollapsed: boolean;
  /**
   * Temporarily removes the rail from the layout entirely (no hover
   * expansion, no reserved margin). Used by the prospectus editor while a
   * table/row is being edited. Never persisted.
   */
  isSidebarHidden: boolean;
  /** Persisted pin state for the left rail. */
  sidebarPin: SidebarPin;
  lastPath: string | null;
  openMobileDrawer: () => void;
  closeMobileDrawer: () => void;
  toggleMobileDrawer: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarHidden: (hidden: boolean) => void;
  setSidebarPin: (pin: SidebarPin) => void;
  /** Pin the rail in its current state, or release it back to `auto`. */
  toggleSidebarPin: () => void;
  setLastPath: (path: string) => void;
}

const initialPin = readStoredPin();

export const useUiStore = create<UiState>((set, get) => ({
  isMobileDrawerOpen: false,
  // A rail pinned shut starts shut, even before the desktop breakpoint hook
  // runs.
  isSidebarCollapsed: initialPin === 'closed',
  isSidebarHidden: false,
  sidebarPin: initialPin,
  lastPath: null,

  openMobileDrawer: () => set({ isMobileDrawerOpen: true }),
  closeMobileDrawer: () => set({ isMobileDrawerOpen: false }),
  toggleMobileDrawer: () =>
    set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),

  toggleSidebar: () => {
    // Collapsing an explicitly pinned-open rail also unpins it — otherwise
    // the button would look broken.
    if (get().sidebarPin === 'open') get().setSidebarPin('auto');
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
  },
  setSidebarCollapsed: (collapsed) => {
    // A rail pinned open never collapses, whoever asks.
    if (collapsed && get().sidebarPin === 'open') return;
    set({ isSidebarCollapsed: collapsed });
  },
  setSidebarHidden: (hidden) => set({ isSidebarHidden: hidden }),

  setSidebarPin: (pin) => {
    try {
      localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, pin);
    } catch {
      /* Ignore — the pin still applies for this session. */
    }
    // Locking forces the matching width; releasing keeps the current one.
    const collapsed =
      pin === 'open'
        ? false
        : pin === 'closed'
          ? true
          : get().isSidebarCollapsed;
    set({ sidebarPin: pin, isSidebarCollapsed: collapsed });
  },

  toggleSidebarPin: () => {
    const { sidebarPin, isSidebarCollapsed } = get();
    if (sidebarPin !== 'auto') {
      get().setSidebarPin('auto');
      return;
    }
    get().setSidebarPin(isSidebarCollapsed ? 'closed' : 'open');
  },

  setLastPath: (path) => {
    if (get().lastPath !== path && get().isMobileDrawerOpen) {
      set({ isMobileDrawerOpen: false, lastPath: path });
    } else {
      set({ lastPath: path });
    }
  },
}));
