import type { Config } from 'tailwindcss';
import { brandColors, brandFontFamilies, semanticColors } from './index';

/**
 * Shared Tailwind preset for all TargonOS apps
 * Provides consistent brand colors, fonts, and semantic tokens
 */
export const targonPreset: Partial<Config> = {
  theme: {
    extend: {
      fontFamily: {
        sans: [brandFontFamilies.primary],
        heading: [brandFontFamilies.heading],
        secondary: [brandFontFamilies.secondary],
        mono: [brandFontFamilies.mono],
      },
      colors: {
        brand: {
          dark: brandColors.main,
          cyan: brandColors.secondary,
          slate: brandColors.accent,
          navy: brandColors.navy,
          teal: brandColors.teal,
          gray: brandColors.gray,
        },
        success: semanticColors.success,
        warning: semanticColors.warning,
        danger: semanticColors.danger,
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 12px -4px rgba(0, 0, 0, 0.04)',
        'soft-lg':
          '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-in-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
      },
    },
  },
};
