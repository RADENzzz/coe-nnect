import { create } from 'zustand';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'coe-nnect:theme';

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Applies the theme to <html>. Light stays the default: only an explicit
 * saved preference (or the pre-hydration script in index.html) enables dark.
 */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;

  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', theme);

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#5c1219');
}

let themeTransitionTimer: number | undefined;

/**
 * Flips the theme with a short color transition on shared app surfaces. The
 * initial hydration path stays instant, and reduced-motion users keep the
 * immediate switch.
 */
function applyThemeWithTransition(theme: Theme) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    applyTheme(theme);
    return;
  }

  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  if (reduceMotion) {
    applyTheme(theme);
    return;
  }

  const root = document.documentElement;
  root.classList.add('theme-transition');
  applyTheme(theme);

  window.clearTimeout(themeTransitionTimer);
  themeTransitionTimer = window.setTimeout(() => {
    root.classList.remove('theme-transition');
  }, 140);
}

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';

  const stored = readStoredTheme();
  if (stored) return stored;

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const initialTheme = getInitialTheme();

// Keep the DOM, meta tags and stored value in sync from the first render.
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,

  setTheme: (theme) => {
    if (theme === get().theme) return;
    applyThemeWithTransition(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* Storage can be unavailable in private mode — the theme still applies. */
    }
    set({ theme });
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));
