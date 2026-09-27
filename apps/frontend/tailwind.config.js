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
        // ── Lumina / Academic Precision palette ──
        surface: {
          DEFAULT: '#FBFBE2',
          dim: '#DBDCC3',
          bright: '#FBFBE2',
          variant: '#E4E4CC',
          'container-lowest': '#FFFFFF',
          'container-low': '#F5F5DC',
          'container': '#EFEFD7',
          'container-high': '#EAEAD1',
          'container-highest': '#E4E4CC',
        },
        'on-surface': {
          DEFAULT: '#1B1D0E',
          variant: '#5A413D',
        },
        'inverse-surface': '#303221',
        'inverse-on-surface': '#F2F2D9',
        'surface-tint': '#B22B1D',

        primary: {
          DEFAULT: '#570000',
          container: '#800000',
          fixed: '#FFDAD4',
          'fixed-dim': '#FFB4A8',
        },
        'on-primary': {
          DEFAULT: '#FFFFFF',
          container: '#FF8371',
          fixed: '#410000',
          'fixed-variant': '#8F0F07',
        },
        'inverse-primary': '#FFB4A8',

        secondary: {
          DEFAULT: '#7C5800',
          container: '#FEB700',
          fixed: '#FFDEA8',
          'fixed-dim': '#FFBA20',
        },
        'on-secondary': {
          DEFAULT: '#FFFFFF',
          container: '#6B4B00',
          fixed: '#271900',
          'fixed-variant': '#5E4200',
        },

        tertiary: {
          DEFAULT: '#570000',
          container: '#800000',
          fixed: '#FFDAD4',
          'fixed-dim': '#FFB4A8',
        },
        'on-tertiary': {
          DEFAULT: '#FFFFFF',
          container: '#FF8371',
          fixed: '#410000',
          'fixed-variant': '#930000',
        },

        error: {
          DEFAULT: '#BA1A1A',
          container: '#FFDAD6',
        },
        'on-error': {
          DEFAULT: '#FFFFFF',
          container: '#93000A',
        },

        outline: {
          DEFAULT: '#8E706C',
          variant: '#E2BFB9',
        },

        background: '#FBFBE2',
        'on-background': '#1B1D0E',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        'display-lg': ['Inter', 'sans-serif'],
        'headline-lg': ['Inter', 'sans-serif'],
        'headline-md': ['Inter', 'sans-serif'],
        'title-lg': ['Inter', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'label-md': ['Inter', 'sans-serif'],
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
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
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
        card: '0 4px 12px rgba(87, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};