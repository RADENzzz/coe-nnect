/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary — Maroon
        primary: {
          DEFAULT: '#800000',
          dark: '#570000',
          light: '#A50000',
          container: '#800000',
          'on-container': '#FF8371',
        },
        // Secondary — Golden Yellow
        secondary: {
          DEFAULT: '#FFB800',
          dark: '#7C5800',
          light: '#FFBA20',
          container: '#FEB700',
          'on-container': '#6B4B00',
        },
        // Surface — flat structure so all utilities work
        surface: {
          DEFAULT: '#FBFBE2',
          low: '#F5F5DC',
          dim: '#DBDCC3',
          bright: '#FBFBE2',
          high: '#EAEAD1',
          highest: '#E4E4CC',
          variant: '#E4E4CC',
        },
        // On-surface
        'on-surface': {
          DEFAULT: '#1B1D0E',
          variant: '#5A413D',
        },
        // Outline
        outline: {
          DEFAULT: '#8E706C',
          variant: '#E2BFB9',
        },
        // Error
        error: {
          DEFAULT: '#BA1A1A',
          container: '#FFDAD6',
          'on-container': '#93000A',
        },
        // Status
        status: {
          success: '#0F5132',
          warning: '#FFB800',
          error: '#BA1A1A',
          info: '#800000',
          pending: '#FFB800',
          confirmed: '#0F5132',
          conflict: '#BA1A1A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'title-lg': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
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
        card: '0 2px 4px rgba(128, 0, 0, 0.05)',
        'card-hover': '0 4px 8px rgba(128, 0, 0, 0.08)',
        modal: '0 8px 24px rgba(128, 0, 0, 0.15)',
      },
      maxWidth: {
        desktop: '1280px',
      },
    },
  },
  plugins: [],
};