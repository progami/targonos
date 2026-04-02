import { alpha, createTheme, type PaletteMode, type ThemeOptions } from '@mui/material/styles';
import { brandColors, brandFontFamilies, brandRadii, semanticColors, surfaceColors } from './tokens';

export type TargonThemeVariant = 'suite' | 'argus';

type CreateThemeArgs = {
  mode: PaletteMode;
  variant?: TargonThemeVariant;
};

function resolvePalette(mode: PaletteMode, variant: TargonThemeVariant): ThemeOptions['palette'] {
  const isDark = mode === 'dark';

  if (variant === 'argus') {
    return {
      mode,
      primary: {
        main: isDark ? brandColors.teal[500] : brandColors.primary,
        dark: isDark ? brandColors.teal[400] : brandColors.navy[950],
        light: isDark ? brandColors.teal[300] : brandColors.navy[700],
        contrastText: isDark ? brandColors.black : brandColors.white,
      },
      secondary: {
        main: isDark ? brandColors.navy[300] : brandColors.teal[500],
        dark: isDark ? brandColors.navy[500] : brandColors.teal[700],
        light: isDark ? brandColors.navy[100] : brandColors.teal[300],
        contrastText: isDark ? brandColors.white : brandColors.black,
      },
      background: {
        default: isDark ? '#07121B' : '#F3F7FA',
        paper: isDark ? '#101E2A' : '#FFFFFF',
      },
      divider: isDark ? surfaceColors.dark.border : surfaceColors.light.border,
      text: {
        primary: isDark ? '#E9F2F8' : '#11263A',
        secondary: isDark ? '#B5C7D7' : '#4C6173',
      },
      success: { main: semanticColors.success[600] },
      warning: { main: semanticColors.warning[500] },
      error: { main: semanticColors.danger[600] },
    };
  }

  return {
    mode,
    primary: {
      main: isDark ? brandColors.teal[500] : brandColors.primary,
      dark: isDark ? brandColors.teal[300] : brandColors.navy[950],
      light: isDark ? brandColors.teal[200] : brandColors.navy[700],
      contrastText: isDark ? brandColors.black : brandColors.white,
    },
    secondary: {
      main: isDark ? brandColors.navy[300] : brandColors.secondary,
      dark: isDark ? brandColors.navy[500] : brandColors.teal[700],
      light: isDark ? brandColors.navy[100] : brandColors.teal[200],
      contrastText: isDark ? brandColors.white : brandColors.black,
    },
    background: {
      default: isDark ? surfaceColors.dark.canvas : surfaceColors.light.canvas,
      paper: isDark ? surfaceColors.dark.paper : surfaceColors.light.paper,
    },
    divider: isDark ? surfaceColors.dark.border : surfaceColors.light.border,
    text: {
      primary: isDark ? '#E7EFF5' : '#14283A',
      secondary: isDark ? '#B7C6D3' : '#556979',
    },
    success: { main: semanticColors.success[600] },
    warning: { main: semanticColors.warning[500] },
    error: { main: semanticColors.danger[600] },
  };
}

function resolveSurface(mode: PaletteMode, variant: TargonThemeVariant) {
  if (variant === 'argus') {
    if (mode === 'dark') {
      return {
        canvas: '#07121B',
        muted: '#0E1B27',
        raised: '#132433',
        hover: alpha('#E9F2F8', 0.06),
        focusRing: alpha(brandColors.teal[500], 0.28),
      };
    }

    return {
      canvas: '#F3F7FA',
      muted: '#EAF1F7',
      raised: '#FFFFFF',
      hover: alpha(brandColors.navy[900], 0.05),
      focusRing: alpha(brandColors.teal[500], 0.2),
    };
  }

  if (mode === 'dark') {
    return {
      canvas: surfaceColors.dark.canvas,
      muted: surfaceColors.dark.subtle,
      raised: surfaceColors.dark.raised,
      hover: alpha('#FFFFFF', 0.06),
      focusRing: alpha(brandColors.teal[500], 0.26),
    };
  }

  return {
    canvas: surfaceColors.light.canvas,
    muted: surfaceColors.light.subtle,
    raised: surfaceColors.light.raised,
    hover: alpha(brandColors.navy[900], 0.05),
    focusRing: alpha(brandColors.teal[500], 0.2),
  };
}

function resolveComponents(mode: PaletteMode, variant: TargonThemeVariant): ThemeOptions['components'] {
  const surface = resolveSurface(mode, variant);
  const isDark = mode === 'dark';

  return {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: mode,
        },
        html: {
          height: '100%',
        },
        body: {
          minHeight: '100%',
          backgroundColor: surface.canvas,
        },
        '#__next': {
          minHeight: '100%',
        },
        '::selection': {
          backgroundColor: alpha(brandColors.teal[500], 0.22),
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: brandRadii.md,
          fontWeight: 600,
          textTransform: 'none',
          whiteSpace: 'nowrap',
        },
        sizeSmall: {
          height: 32,
          padding: '0 12px',
        },
        sizeMedium: {
          height: 36,
          padding: '0 16px',
        },
        sizeLarge: {
          height: 42,
          padding: '0 20px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: brandRadii.lg,
          border: `1px solid ${isDark ? surfaceColors.dark.border : surfaceColors.light.border}`,
          boxShadow: isDark
            ? '0 12px 24px -16px rgba(0, 0, 0, 0.45)'
            : '0 10px 24px -20px rgba(0, 44, 81, 0.28)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: brandRadii.sm,
          fontWeight: 600,
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        fullWidth: true,
        maxWidth: 'md',
      },
      styleOverrides: {
        paper: {
          borderRadius: brandRadii.xl,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${isDark ? surfaceColors.dark.border : surfaceColors.light.border}`,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: brandRadii.md,
          backgroundColor: isDark ? surface.muted : surface.raised,
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: brandColors.teal[500],
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: brandColors.teal[500],
            borderWidth: 2,
            boxShadow: `0 0 0 4px ${surface.focusRing}`,
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 40,
          padding: '8px 14px',
          fontSize: '0.875rem',
          fontWeight: 600,
          textTransform: 'none',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
        },
        indicator: {
          height: 3,
          borderRadius: '999px 999px 0 0',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: brandRadii.sm,
          fontSize: '0.75rem',
        },
      },
    },
  };
}

export function createTargonMuiTheme({
  mode,
  variant = 'suite',
}: CreateThemeArgs) {
  return createTheme({
    shape: {
      borderRadius: brandRadii.md,
    },
    palette: resolvePalette(mode, variant),
    typography: {
      fontFamily: brandFontFamilies.primary,
      fontSize: 14,
      h1: {
        fontFamily: brandFontFamilies.heading,
        fontWeight: 700,
        letterSpacing: '-0.03em',
      },
      h2: {
        fontFamily: brandFontFamilies.heading,
        fontWeight: 700,
        letterSpacing: '-0.02em',
      },
      h3: {
        fontFamily: brandFontFamilies.heading,
        fontWeight: 700,
        letterSpacing: '-0.02em',
      },
      h4: {
        fontFamily: brandFontFamilies.heading,
        fontWeight: 700,
      },
      button: {
        fontFamily: brandFontFamilies.primary,
        fontWeight: 600,
      },
      overline: {
        fontFamily: brandFontFamilies.mono,
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      },
      caption: {
        fontFamily: brandFontFamilies.mono,
      },
    },
    components: resolveComponents(mode, variant),
  });
}

export const suiteLightTheme = createTargonMuiTheme({ mode: 'light', variant: 'suite' });
export const suiteDarkTheme = createTargonMuiTheme({ mode: 'dark', variant: 'suite' });
export const argusLightTheme = createTargonMuiTheme({ mode: 'light', variant: 'argus' });
export const argusDarkTheme = createTargonMuiTheme({ mode: 'dark', variant: 'argus' });
