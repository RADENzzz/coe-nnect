export const theme = {
  colors: {
    primary: {
      DEFAULT: '#1E3A8A',
      light: '#3B82F6',
      dark: '#1E40AF',
    },
    accent: {
      DEFAULT: '#F59E0B',
      light: '#FCD34D',
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
  },
  fonts: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
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