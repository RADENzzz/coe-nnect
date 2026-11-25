import { create } from 'zustand';

export const LOADING_ANIMATIONS_STORAGE_KEY = 'coe-nnect:loading-animations';

function readStoredLoadingAnimations(): boolean {
  try {
    const stored = localStorage.getItem(LOADING_ANIMATIONS_STORAGE_KEY);
    // Default off: scrambled placeholder text reads as a glitch to most users.
    // Anyone who wants it can turn it on in Settings → Appearance.
    return stored === null ? false : stored === 'true';
  } catch {
    /* Storage can be unavailable in private mode. */
    return false;
  }
}

interface MotionState {
  /** Animate values as data loads. Stored per browser, not per account. */
  loadingAnimations: boolean;
  setLoadingAnimations: (enabled: boolean) => void;
}

export const useMotionStore = create<MotionState>((set) => ({
  loadingAnimations: readStoredLoadingAnimations(),

  setLoadingAnimations: (enabled) => {
    try {
      localStorage.setItem(LOADING_ANIMATIONS_STORAGE_KEY, String(enabled));
    } catch {
      /* The preference still applies for this session. */
    }
    set({ loadingAnimations: enabled });
  },
}));
