/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── New Design System ──
        // Brand
        brand: {
          DEFAULT: '#5c1219',
          hover: '#4a0e14',
        },
        // Backgrounds
        'app-root': '#020617',         // slate-950
        'workspace': '#f8fafc',        // slate-50
        surface: '#ffffff',

        // Text
        'text-primary': '#0f172a',     // slate-900
        'text-secondary': '#64748b',   // slate-500
        'text-muted': '#475569',       // slate-600

        // Borders
        'border-default': '#e2e8f0',   // slate-200
        'border-subtle': '#f1f5f9',    // slate-100
        'border-outline': '#cbd5e1',   // slate-300

        // ── Legacy aliases so existing code keeps working ──
        surface: {
          DEFAULT: '#ffffff',
          dim: '#e2e8f0',
          bright: '#ffffff',
          variant: '#e2e8f0',
          'container-lowest': '#ffffff',
          'container-low': '#f8fafc',
          'container': '#f1f5f9',
          'container-high': '#e2e8f0',
          'container-highest': '#cbd5e1',
        },
        'on-surface': {
          DEFAULT: '#0f172a',
          variant: '#64748b',
        },
        'inverse-surface': '#1e293b',
        'inverse-on-surface': '#f8fafc',
        'surface-tint': '#5c1219',

        primary: {
          DEFAULT: '#5c1219',
          container: '#4a0e14',
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
          DEFAULT: '#cbd5e1',
          variant: '#e2e8f0',
        },

        background: '#f8fafc',
        'on-background': '#0f172a',

        // Tone / badge colors
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          500: '#10b981',
          700: '#047857',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
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
        // Keep custom sizes used elsewhere
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
      },

      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        sm: '0 1px 2px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};