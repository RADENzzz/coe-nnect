/** @type {import('tailwindcss').Config} */

// Colors driven by CSS variables so the whole app can switch themes at runtime.
// Light values live in :root and dark values in `.dark` (see src/styles/globals.css).
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      colors: {
        // ── New Design System ──
        // Brand
        brand: {
          DEFAULT: token('brand-700'),
          50: token('brand-50'),
          100: token('brand-100'),
          200: token('brand-200'),
          300: '#eea1a8',
          400: '#dd6a75',
          500: '#8b1e2d',
          600: '#6d1822',
          700: token('brand-700'),
          800: '#4a0e14',
          900: '#3a0b10',
          hover: '#4a0e14',
        },

        // ── Neutral scale ──
        slate: {
          50: token('slate-50'),
          100: token('slate-100'),
          200: token('slate-200'),
          300: token('slate-300'),
          400: token('slate-400'),
          500: token('slate-500'),
          600: token('slate-600'),
          700: token('slate-700'),
          800: token('slate-800'),
          900: token('slate-900'),
          950: token('slate-950'),
        },

        // Backgrounds
        'app-root': token('app-root'),
        workspace: token('workspace'),

        // Text
        'text-primary': token('text-primary'),
        'text-secondary': token('text-secondary'),
        'text-muted': token('text-muted'),

        // Borders
        'border-default': token('border-default'),
        'border-subtle': token('border-subtle'),
        'border-outline': token('border-outline'),

        // ── Legacy aliases so existing code keeps working ──
        surface: {
          DEFAULT: token('surface'),
          dim: token('surface-dim'),
          bright: token('surface-bright'),
          variant: token('surface-variant'),
          'container-lowest': token('surface-container-lowest'),
          'container-low': token('surface-container-low'),
          container: token('surface-container'),
          'container-high': token('surface-container-high'),
          'container-highest': token('surface-container-highest'),
        },
        'on-surface': {
          DEFAULT: token('on-surface'),
          variant: token('on-surface-variant'),
        },
        'inverse-surface': '#1e293b',
        'inverse-on-surface': '#f8fafc',
        'surface-tint': token('surface-tint'),

        primary: {
          DEFAULT: token('primary'),
          container: token('primary-container'),
          fixed: '#fecdd3',
          'fixed-dim': '#fda4af',
        },
        'on-primary': {
          DEFAULT: '#ffffff',
          container: '#fda4af',
          fixed: '#3b0007',
          'fixed-variant': '#7f1d1d',
        },
        'inverse-primary': '#fda4af',

        secondary: {
          DEFAULT: '#475569',
          container: '#cbd5e1',
          fixed: '#e2e8f0',
          'fixed-dim': '#94a3b8',
        },
        'on-secondary': {
          DEFAULT: '#ffffff',
          container: '#1e293b',
          fixed: '#0f172a',
          'fixed-variant': '#334155',
        },

        tertiary: {
          DEFAULT: '#5c1219',
          container: '#4a0e14',
          fixed: '#fecdd3',
          'fixed-dim': '#fda4af',
        },
        'on-tertiary': {
          DEFAULT: '#ffffff',
          container: '#fda4af',
          fixed: '#3b0007',
          'fixed-variant': '#7f1d1d',
        },

        error: {
          DEFAULT: '#b91c1c',
          container: '#fee2e2',
        },
        'on-error': {
          DEFAULT: '#ffffff',
          container: '#991b1b',
        },

        outline: {
          DEFAULT: token('outline'),
          variant: token('outline-variant'),
        },

        background: token('background'),
        'on-background': token('on-background'),

        // Tone / badge colors (the light tints are themed; strong shades stay put)
        red: {
          50: token('red-50'),
          100: token('red-100'),
          200: token('red-200'),
          300: token('red-300'),
        },
        rose: {
          50: token('rose-50'),
          100: token('rose-100'),
          200: token('rose-200'),
          300: token('rose-300'),
        },
        blue: {
          50: token('blue-50'),
          100: token('blue-100'),
          200: token('blue-200'),
          300: token('blue-300'),
        },
        green: {
          50: token('green-50'),
          100: token('green-100'),
          200: token('green-200'),
          300: token('green-300'),
        },
        purple: {
          50: token('purple-50'),
          100: token('purple-100'),
          200: token('purple-200'),
          300: token('purple-300'),
        },
        violet: {
          50: token('violet-50'),
          100: token('violet-100'),
          200: token('violet-200'),
          300: token('violet-300'),
        },
        orange: {
          50: token('orange-50'),
          100: token('orange-100'),
          200: token('orange-200'),
          300: token('orange-300'),
        },
        emerald: {
          50: token('emerald-50'),
          100: token('emerald-100'),
          200: token('emerald-200'),
          300: token('emerald-300'),
          500: '#10b981',
          700: '#047857',
        },
        amber: {
          50: token('amber-50'),
          100: token('amber-100'),
          200: token('amber-200'),
          300: token('amber-300'),
          500: '#f59e0b',
          700: '#b45309',
        },
      },

      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },

      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'title-lg': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
      },

      borderRadius: {
        DEFAULT: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        full: '9999px',
      },

      spacing: {
        unit: '8px',
        'container-padding': '24px',
        gutter: '16px',
        'margin-sm': '12px',
        'margin-md': '24px',
        'margin-lg': '40px',
        // Safe-area helpers (used via pb-safe / pt-safe utilities below)
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },

      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        sm: '0 1px 2px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};