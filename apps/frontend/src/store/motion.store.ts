import { create } from 'zustand';

export const LOADING_ANIMATIONS_STORAGE_KEY = 'coe-nnect:loading-animations';
export const TEXT_LOADING_ANIMATIONS_STORAGE_KEY =
  'coe-nnect:text-loading-animations';
export const LANDING_INTRO_ANIMATIONS_STORAGE_KEY =
  'coe-nnect:landing-intro-animations';

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

function readStoredTextLoadingAnimations(): boolean {
  try {
    const stored = localStorage.getItem(TEXT_LOADING_ANIMATIONS_STORAGE_KEY);
    return stored === null ? false : stored === 'true';
  } catch {
    return false;
  }
}

function readStoredLandingIntroAnimations(): boolean {
  try {
    const stored = localStorage.getItem(LANDING_INTRO_ANIMATIONS_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/** Shared gate: a preference only animates when reduced motion is off. */
export function motionAllowed(preference: boolean, reduced: boolean): boolean {
  return preference && !reduced;
}

interface MotionState {
  /** Animate values as data loads. Stored per browser, not per account. */
  loadingAnimations: boolean;
  setLoadingAnimations: (enabled: boolean) => void;
  /** Decode random glyphs into loading text. Opt-in, default off. */
  textLoadingAnimations: boolean;
  setTextLoadingAnimations: (enabled: boolean) => void;
  /** Play the landing-page seal splash. Default on. */
  landingIntroAnimations: boolean;
  setLandingIntroAnimations: (enabled: boolean) => void;
}

export const useMotionStore = create<MotionState>((set) => ({
  loadingAnimations: readStoredLoadingAnimations(),
  textLoadingAnimations: readStoredTextLoadingAnimations(),
  landingIntroAnimations: readStoredLandingIntroAnimations(),

  setLoadingAnimations: (enabled) => {
    try {
      localStorage.setItem(LOADING_ANIMATIONS_STORAGE_KEY, String(enabled));
    } catch {
      /* The preference still applies for this session. */
    }
    set({ loadingAnimations: enabled });
  },

  setTextLoadingAnimations: (enabled) => {
    try {
      localStorage.setItem(
        TEXT_LOADING_ANIMATIONS_STORAGE_KEY,
        String(enabled),
      );
    } catch {
      /* The preference still applies for this session. */
    }
    set({ textLoadingAnimations: enabled });
  },

  setLandingIntroAnimations: (enabled) => {
    try {
      localStorage.setItem(
        LANDING_INTRO_ANIMATIONS_STORAGE_KEY,
        String(enabled),
      );
    } catch {
      /* The preference still applies for this session. */
    }
    set({ landingIntroAnimations: enabled });
  },
}));
