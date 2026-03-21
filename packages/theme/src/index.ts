export const brandColors = {
  /** Main brand navy (from brand DNA) */
  main: '#0b273f',
  /** Secondary brand teal/cyan */
  secondary: '#00C2B9',
  /** Accent muted gray */
  accent: '#6F7B8B',
  /** White */
  white: '#FFFFFF',

  /** Navy color scale (based on brand DNA #0b273f) */
  navy: {
    50: '#f0f4f7',
    100: '#dae4ec',
    200: '#b5c9d9',
    300: '#8faec6',
    400: '#6a93b3',
    500: '#3d6d8f',
    600: '#2a5270',
    700: '#1a3d56',
    800: '#0b273f',
    900: '#071c2d',
    950: '#04111c',
  },

  /** Teal color scale */
  teal: {
    50: '#e6faf9',
    100: '#ccf5f3',
    200: '#99ebe7',
    300: '#66e1db',
    400: '#33d7cf',
    500: '#00C2B9',
    600: '#00a89f',
    700: '#008d86',
    800: '#00726c',
    900: '#005753',
    950: '#003c3a',
  },

  /** Gray color scale */
  gray: {
    50: '#f7f8f9',
    100: '#eef0f2',
    200: '#dde1e5',
    300: '#ccd1d8',
    400: '#bbc2cb',
    500: '#aab3be',
    600: '#99a4b1',
    700: '#8894a4',
    800: '#778597',
    900: '#6F7B8B',
    950: '#5a6372',
  },

  /** Light neutral (from brand DNA) */
  light: '#F5F5F5',

  /** Legacy aliases */
  primary: '#0b273f',
  primaryMuted: '#071c2d',
  primaryDeep: '#04111c',
  primaryOverlay: '#020a10',
  accentHover: '#00AFA8',
  accentShadow: 'rgba(0, 194, 185, 0.28)',
  accentShadowHover: 'rgba(0, 194, 185, 0.35)',
  supportNavy: '#002433',
  supportInk: '#02253B',
  slate: '#6F7B8B',
} as const;

export type BrandColorToken = keyof typeof brandColors;

export const brandFontFamilies = {
  /** Headings — geometric, high-impact */
  heading: 'League Spartan, system-ui, sans-serif',
  /** Primary body/UI — clean, modern */
  primary: 'Outfit, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  /** Secondary/accent — data labels, chips, metadata */
  secondary: 'Montserrat, system-ui, sans-serif',
  /** Monospace font for code */
  mono: 'JetBrains Mono, Monaco, Consolas, monospace',
} as const;

export type BrandFontToken = keyof typeof brandFontFamilies;

export const brandRadii = {
  xl: '32px',
  lg: '18px',
  md: '12px',
  sm: '8px',
} as const;

export type BrandRadiusToken = keyof typeof brandRadii;

/** Semantic colors for UI feedback */
export const semanticColors = {
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
} as const;
