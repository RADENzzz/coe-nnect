import { create } from 'zustand';
import { useThemeStore, type Theme } from './theme.store';

export const APPEARANCE_STORAGE_KEY = 'coe-nnect:appearance';
export const APPEARANCE_CSS_STORAGE_KEY = 'coe-nnect:appearance-css';
export const LOGO_STORAGE_KEY = 'coe-nnect:brand-logo';

export type SurfaceTint = 'default' | 'warm' | 'cool' | 'neutral';

export interface Appearance {
  /** Brand / accent colour as `#rrggbb`. */
  accent: string;
  /** Page background tone. Independent from the accent. */
  surfaceTint: SurfaceTint;
  /** Experimental glassmorphism + animated liquid backdrop. */
  glass: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: '#5c1219',
  surfaceTint: 'default',
  glass: false,
};

export interface AccentPreset {
  name: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'CoE Maroon', hex: '#5c1219' },
  { name: 'Engineering Blue', hex: '#1d4ed8' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Forest', hex: '#15803d' },
  { name: 'Violet', hex: '#6d28d9' },
  { name: 'Crimson', hex: '#b91c1c' },
  { name: 'Amber', hex: '#b45309' },
  { name: 'Graphite', hex: '#334155' },
];

export const SURFACE_TINTS: {
  key: SurfaceTint;
  label: string;
  description: string;
  swatchLight: string;
  swatchDark: string;
}[] = [
  {
    key: 'default',
    label: 'Default',
    description: 'Cool slate — the original look',
    swatchLight: '#f8fafc',
    swatchDark: '#020617',
  },
  {
    key: 'warm',
    label: 'Warm',
    description: 'Soft paper tone',
    swatchLight: '#faf8f5',
    swatchDark: '#110e0b',
  },
  {
    key: 'cool',
    label: 'Cool',
    description: 'Crisp blue-grey',
    swatchLight: '#f4f7fc',
    swatchDark: '#090e16',
  },
  {
    key: 'neutral',
    label: 'Neutral',
    description: 'Balanced grey',
    swatchLight: '#f6f6f7',
    swatchDark: '#0f0f11',
  },
];

// ── Colour maths ─────────────────────────────────────────────

type RGB = [number, number, number];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return null;
}

function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex) ?? DEFAULT_APPEARANCE.accent;
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

function rgbToHex([r, g, b]: RGB): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** `rgb(var(--x))` expects a bare "R G B" triplet. */
function triplet([r, g, b]: RGB): string {
  return `${r} ${g} ${b}`;
}

// ── Token maps ───────────────────────────────────────────────

type VarMap = Record<string, string>;

/**
 * Exact accent tokens that ship in globals.css. Emitted when the user is on
 * the default accent so the appearance layer is a visual no-op.
 */
const DEFAULT_ACCENT_LIGHT: VarMap = {
  '--primary': '92 18 25',
  '--primary-container': '74 14 20',
  '--surface-tint': '92 18 25',
  '--brand-50': '253 242 243',
  '--brand-100': '251 229 231',
  '--brand-200': '246 201 205',
  '--brand-700': '92 18 25',
  '--accent-mid': '221 106 117',
  '--accent-tint': '238 161 168',
  '--accent-pale': '246 201 205',
  '--accent-deep': '61 11 16',
  '--sidebar-active-fg': '92 18 25',
};

const DEFAULT_ACCENT_DARK: VarMap = {
  '--primary': '139 30 45',
  '--primary-container': '109 24 34',
  '--surface-tint': '238 161 168',
  '--brand-50': '43 15 19',
  '--brand-100': '58 20 25',
  '--brand-200': '76 26 33',
  '--brand-700': '139 30 45',
  '--accent-mid': '221 106 117',
  '--accent-tint': '238 161 168',
  '--accent-pale': '246 201 205',
  '--accent-deep': '61 11 16',
  '--sidebar-active-fg': '92 18 25',
};

/**
 * Surface/text tokens mirrored from globals.css. These are always emitted
 * for both modes so a preview can render the opposite theme — otherwise a
 * light preview inside a dark page would inherit dark surfaces (and text).
 */
const BASE_LIGHT: VarMap = {
  '--background': '248 250 252',
  '--workspace': '248 250 252',
  '--surface': '255 255 255',
  '--surface-dim': '226 232 240',
  '--surface-variant': '226 232 240',
  '--surface-container-lowest': '255 255 255',
  '--surface-container-low': '248 250 252',
  '--surface-container': '241 245 249',
  '--surface-container-high': '226 232 240',
  '--surface-container-highest': '203 213 225',
  '--on-surface': '15 23 42',
  '--on-background': '15 23 42',
  '--on-surface-variant': '100 116 139',
  '--outline': '203 213 225',
  '--outline-variant': '226 232 240',
};

const BASE_DARK: VarMap = {
  '--background': '2 6 23',
  '--workspace': '2 6 23',
  '--surface': '15 23 42',
  '--surface-dim': '2 6 23',
  '--surface-variant': '30 41 59',
  '--surface-container-lowest': '15 23 42',
  '--surface-container-low': '11 21 38',
  '--surface-container': '19 31 53',
  '--surface-container-high': '30 41 59',
  '--surface-container-highest': '51 65 85',
  '--on-surface': '241 245 249',
  '--on-background': '241 245 249',
  '--on-surface-variant': '148 163 184',
  '--outline': '51 65 85',
  '--outline-variant': '30 41 59',
};

function accentVars(accent: string, mode: Theme): VarMap {
  const [h, s, l] = rgbToHsl(hexToRgb(accent));
  // Very desaturated picks would collapse the brand tints into grey;
  // keep a floor so accents still read as a colour.
  const sat = Math.max(0.18, s);
  const tint = (satMul: number, lightness: number) =>
    triplet(hslToRgb(h, clamp(sat * satMul, 0, 1), lightness));

  if (mode === 'light') {
    // Keep the solid brand colour dark enough for white text on top.
    const deep = clamp(l, 0.16, 0.36);
    return {
      '--primary': tint(1, deep),
      '--primary-container': tint(1, Math.max(0.1, deep - 0.07)),
      '--surface-tint': tint(1, deep),
      '--brand-700': tint(1, deep),
      '--brand-50': tint(0.55, 0.97),
      '--brand-100': tint(0.55, 0.94),
      '--brand-200': tint(0.6, 0.86),
      '--accent-mid': tint(0.75, 0.55),
      '--accent-tint': tint(0.7, 0.78),
      '--accent-pale': tint(0.6, 0.92),
      '--accent-deep': tint(1, Math.max(0.08, deep - 0.12)),
      '--sidebar-active-fg': tint(1, deep),
    };
  }

  const deep = clamp(l, 0.3, 0.44);
  return {
    '--primary': tint(1, deep),
    '--primary-container': tint(1, Math.max(0.24, deep - 0.05)),
    '--surface-tint': tint(0.7, 0.72),
    '--brand-700': tint(1, deep),
    '--brand-50': tint(0.55, 0.12),
    '--brand-100': tint(0.55, 0.155),
    '--brand-200': tint(0.55, 0.205),
    '--accent-mid': tint(0.75, 0.58),
    '--accent-tint': tint(0.7, 0.74),
    '--accent-pale': tint(0.6, 0.9),
    '--accent-deep': tint(1, Math.max(0.16, deep - 0.14)),
    '--sidebar-active-fg': tint(1, Math.max(0.2, deep - 0.14)),
  };
}

interface TintPalette {
  background: string;
  workspace: string;
  surface: string;
  surfaceContainerLowest: string;
  surfaceVariant: string;
  containerLow: string;
  container: string;
  surfaceDim: string;
}

const TINT_PALETTES: Record<Exclude<SurfaceTint, 'default'>, Record<Theme, TintPalette>> = {
  warm: {
    light: {
      background: '250 248 245',
      workspace: '250 248 245',
      surface: '255 253 250',
      surfaceContainerLowest: '255 253 250',
      surfaceVariant: '234 229 222',
      containerLow: '253 251 249',
      container: '246 242 236',
      surfaceDim: '236 231 224',
    },
    dark: {
      background: '17 14 11',
      workspace: '17 14 11',
      surface: '22 18 14',
      surfaceContainerLowest: '22 18 14',
      surfaceVariant: '42 35 28',
      containerLow: '24 20 16',
      container: '31 26 21',
      surfaceDim: '12 10 8',
    },
  },
  cool: {
    light: {
      background: '244 247 252',
      workspace: '244 247 252',
      surface: '255 255 255',
      surfaceContainerLowest: '255 255 255',
      surfaceVariant: '222 230 241',
      containerLow: '248 250 254',
      container: '238 243 250',
      surfaceDim: '219 227 238',
    },
    dark: {
      background: '9 14 22',
      workspace: '9 14 22',
      surface: '14 21 33',
      surfaceContainerLowest: '14 21 33',
      surfaceVariant: '30 41 58',
      containerLow: '13 19 29',
      container: '18 25 37',
      surfaceDim: '6 10 16',
    },
  },
  neutral: {
    light: {
      background: '246 246 247',
      workspace: '246 246 247',
      surface: '253 253 254',
      surfaceContainerLowest: '253 253 254',
      surfaceVariant: '228 228 231',
      containerLow: '251 251 252',
      container: '240 240 242',
      surfaceDim: '225 225 228',
    },
    dark: {
      background: '15 15 17',
      workspace: '15 15 17',
      surface: '21 21 24',
      surfaceContainerLowest: '21 21 24',
      surfaceVariant: '38 38 43',
      containerLow: '20 20 23',
      container: '27 27 31',
      surfaceDim: '10 10 12',
    },
  },
};

function tintVars(tint: SurfaceTint, mode: Theme): VarMap {
  if (tint === 'default') return {};
  const palette = TINT_PALETTES[tint][mode];
  return {
    '--background': palette.background,
    '--workspace': palette.workspace,
    '--surface': palette.surface,
    '--surface-container-lowest': palette.surfaceContainerLowest,
    '--surface-variant': palette.surfaceVariant,
    '--surface-container-low': palette.containerLow,
    '--surface-container': palette.container,
    '--surface-dim': palette.surfaceDim,
  };
}

function buildVarMaps(a: Appearance): { light: VarMap; dark: VarMap } {
  const accentLight =
    a.accent === DEFAULT_APPEARANCE.accent
      ? DEFAULT_ACCENT_LIGHT
      : accentVars(a.accent, 'light');
  const accentDark =
    a.accent === DEFAULT_APPEARANCE.accent
      ? DEFAULT_ACCENT_DARK
      : accentVars(a.accent, 'dark');

  return {
    light: {
      ...BASE_LIGHT,
      ...accentLight,
      ...tintVars(a.surfaceTint, 'light'),
    },
    dark: {
      ...BASE_DARK,
      ...accentDark,
      ...tintVars(a.surfaceTint, 'dark'),
    },
  };
}

function declarations(vars: VarMap): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join('');
}

/**
 * Both light and dark values are emitted together, scoped to `html.dark`
 * for the real theme and to `html .dark` / `html .light` so the Settings
 * preview can render both side by side regardless of the active theme.
 */
export function buildAppearanceCss(a: Appearance): string {
  const { light, dark } = buildVarMaps(a);
  return [
    `html:root,html .light{${declarations(light)}}`,
    `html.dark,html .dark{${declarations(dark)}}`,
  ].join('\n');
}

const STYLE_ELEMENT_ID = 'coe-appearance';

export function applyAppearance(a: Appearance): void {
  if (typeof document === 'undefined') return;
  const css = buildAppearanceCss(a);

  // The glass theme is class-driven; its rules live in globals.css so they
  // can be removed cleanly without regenerating the variable maps.
  document.documentElement.classList.toggle('glass', a.glass);

  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;

  try {
    localStorage.setItem(APPEARANCE_CSS_STORAGE_KEY, css);
  } catch {
    /* Storage can be unavailable in private mode. */
  }

  syncBrowserChrome(a);
}

/** Keeps the mobile browser chrome in step with the chosen accent. */
function syncBrowserChrome(a: Appearance): void {
  if (typeof document === 'undefined') return;
  const theme = useThemeStore.getState().theme;
  const mode: Theme = theme === 'dark' ? 'dark' : 'light';
  const vars = buildVarMaps(a)[mode];
  // Under glass the page edge is the blurred background, so matching the
  // browser chrome to the background blends better than the accent.
  const token = a.glass ? '--background' : '--primary';
  const primary = (vars[token] ?? DEFAULT_ACCENT_LIGHT['--primary'])
    .split(' ')
    .map((n) => Number(n));
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', rgbToHex(primary as RGB));
}

export function getAccentHex(appearance: Appearance, theme: Theme): string {
  const vars = buildVarMaps(appearance)[theme];
  const parts = (vars['--primary'] ?? DEFAULT_ACCENT_LIGHT['--primary'])
    .split(' ')
    .map((n) => Number(n));
  return rgbToHex(parts as RGB);
}

// ── Persistence ──────────────────────────────────────────────

function isSurfaceTint(value: unknown): value is SurfaceTint {
  return (
    value === 'default' ||
    value === 'warm' ||
    value === 'cool' ||
    value === 'neutral'
  );
}

function readStoredAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance> | null;
    return {
      accent: normalizeHex(parsed?.accent) ?? DEFAULT_APPEARANCE.accent,
      surfaceTint: isSurfaceTint(parsed?.surfaceTint)
        ? parsed.surfaceTint
        : 'default',
      glass: parsed?.glass === true,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function readStoredLogo(): string | null {
  try {
    const stored = localStorage.getItem(LOGO_STORAGE_KEY);
    return stored && stored.startsWith('data:image/') ? stored : null;
  } catch {
    return null;
  }
}

// ── Store ────────────────────────────────────────────────────

interface AppearanceState {
  appearance: Appearance;
  logo: string | null;
  setAccent: (hex: string) => void;
  setSurfaceTint: (tint: SurfaceTint) => void;
  setGlass: (glass: boolean) => void;
  resetAppearance: () => void;
  setLogo: (dataUrl: string | null) => void;
}

function persistAppearance(a: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* Ignore — the preference still applies for this session. */
  }
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  appearance: readStoredAppearance(),
  logo: readStoredLogo(),

  setAccent: (hex) => {
    const accent = normalizeHex(hex);
    if (!accent) return;
    const appearance = { ...get().appearance, accent };
    applyAppearance(appearance);
    persistAppearance(appearance);
    set({ appearance });
  },

  setSurfaceTint: (surfaceTint) => {
    const appearance = { ...get().appearance, surfaceTint };
    applyAppearance(appearance);
    persistAppearance(appearance);
    set({ appearance });
  },

  setGlass: (glass) => {
    const appearance = { ...get().appearance, glass };
    applyAppearance(appearance);
    persistAppearance(appearance);
    set({ appearance });
  },

  resetAppearance: () => {
    // "Reset colours" leaves the experimental theme switch untouched.
    const appearance = { ...DEFAULT_APPEARANCE, glass: get().appearance.glass };
    applyAppearance(appearance);
    persistAppearance(appearance);
    set({ appearance });
  },

  setLogo: (dataUrl) => {
    try {
      if (dataUrl) localStorage.setItem(LOGO_STORAGE_KEY, dataUrl);
      else localStorage.removeItem(LOGO_STORAGE_KEY);
    } catch {
      /* Quota or private mode — keep it in memory only. */
    }
    set({ logo: dataUrl });
  },
}));

// Apply on load (also rewrites the pre-hydration <style> with identical CSS)
// and keep the browser chrome colour in sync when the theme flips.
applyAppearance(useAppearanceStore.getState().appearance);
useThemeStore.subscribe(() =>
  syncBrowserChrome(useAppearanceStore.getState().appearance),
);
