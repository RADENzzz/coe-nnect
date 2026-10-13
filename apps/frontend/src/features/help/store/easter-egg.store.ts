import { create } from 'zustand';

interface EasterEggState {
  taps: number;
  revealed: boolean;
  registerTap: () => void;
  close: () => void;
  reset: () => void;
}

export const EASTER_EGG_TOTAL_TAPS = 8;
const RESET_DELAY_MS = 2000;

let resetTimer: number | null = null;

export const useEasterEggStore = create<EasterEggState>((set, get) => ({
  taps: 0,
  revealed: false,

  registerTap: () => {
    const state = get();
    if (state.revealed) {
      set({ revealed: false, taps: 0 });
      return;
    }
    const next = state.taps + 1;
    if (resetTimer) window.clearTimeout(resetTimer);
    if (next >= EASTER_EGG_TOTAL_TAPS) {
      set({ revealed: true, taps: 0 });
      return;
    }
    set({ taps: next });
    resetTimer = window.setTimeout(() => {
      const current = get();
      if (!current.revealed) set({ taps: 0 });
    }, RESET_DELAY_MS);
  },

  close: () => {
    if (resetTimer) window.clearTimeout(resetTimer);
    set({ revealed: false, taps: 0 });
  },

  reset: () => {
    if (resetTimer) window.clearTimeout(resetTimer);
    set({ taps: 0, revealed: false });
  },
}));