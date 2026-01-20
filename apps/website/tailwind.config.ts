import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--accent-strong) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)'
      },
      borderRadius: {
        card: 'var(--radius-card)',
        pill: '9999px'
      },
      boxShadow: {
        soft: '0 12px 40px rgba(0,0,0,0.10)',
        softer: '0 8px 24px rgba(0,0,0,0.08)'
      },
      letterSpacing: {
        tightish: '-0.02em'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 200ms ease-out',
        'accordion-up': 'accordion-up 200ms ease-out'
      },
      typography: {
        DEFAULT: {
          css: {
            color: 'rgb(var(--ink))',
            a: { color: 'rgb(var(--ink))', textDecoration: 'underline' },
            h2: { letterSpacing: '-0.02em' },
            h3: { letterSpacing: '-0.02em' }
          }
        }
      }
    }
  },
  plugins: [typography]
};

export default config;
