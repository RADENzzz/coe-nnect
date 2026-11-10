export const theme = {
  colors: {
    brand: {
      DEFAULT: '#5c1219',
      hover: '#4a0e14',
    },
    workspace: '#f7f7f7',
    surface: '#ffffff',
    text: {
      primary: '#171717',
      secondary: '#737373',
      muted: '#404040',
    },
    border: {
      default: '#e5e5e5',
      subtle: '#f5f5f5',
      outline: '#d4d4d4',
    },
    badge: {
      neutral: { bg: '#fafafa', text: '#404040', border: '#e5e5e5' },
      success: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
      warning: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
      danger: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
      brand: { bg: '#fef2f2', text: '#5c1219', border: '#fecaca' },
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