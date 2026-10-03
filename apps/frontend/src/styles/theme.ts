export const theme = {
  colors: {
    brand: {
      DEFAULT: '#5c1219',
      hover: '#4a0e14',
    },
    workspace: '#f8fafc',
    surface: '#ffffff',
    text: {
      primary: '#0f172a',
      secondary: '#64748b',
      muted: '#475569',
    },
    border: {
      default: '#e2e8f0',
      subtle: '#f1f5f9',
      outline: '#cbd5e1',
    },
    badge: {
      neutral: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
      success: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
      warning: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
      danger: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
      brand: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
    },
  },
  fonts: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

export type Theme = typeof theme;