import type { Config } from 'tailwindcss';
import { brandFontFamilies, brandRadii } from './tokens';

export const targonPreset: Partial<Config> = {
  theme: {
    extend: {
      fontFamily: {
        sans: [brandFontFamilies.primary],
        heading: [brandFontFamilies.heading],
        mono: [brandFontFamilies.mono],
      },
      borderRadius: {
        sm: `${brandRadii.sm}px`,
        DEFAULT: `${brandRadii.md}px`,
        lg: `${brandRadii.lg}px`,
        xl: `${brandRadii.xl}px`,
      },
      boxShadow: {
        shell: '0 10px 30px -20px rgba(0, 44, 81, 0.22)',
        panel: '0 12px 28px -22px rgba(0, 44, 81, 0.18)',
      },
      maxWidth: {
        shell: '1600px',
        reading: '72ch',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
    },
  },
};
