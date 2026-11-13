import { create } from 'zustand';

export const LOADING_ANIMATIONS_STORAGE_KEY = 'coe-nnect:loading-animations';

function readStoredLoadingAnimations(): boolean {
  try {
    const stored = localStorage.getItem(LOADING_ANIMATIONS_STORAGE_KEY);
    // Default on: the animation is the intended experience.
    return stored === null ? true : stored === 'true';
  } catch {
    /* Storage can be unavailable in private mode. */
    return true;
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
