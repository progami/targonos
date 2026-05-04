import { createTheme } from '@mui/material/styles';

const shared = {
  typography: {
    fontFamily: 'var(--font-sans), Inter, system-ui, sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true as const,
      },
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 600,
          borderRadius: 12,
          whiteSpace: 'nowrap' as const,
          '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'none' },
        },
        sizeSmall: {
          height: 32,
          padding: '0 12px',
          fontSize: '0.75rem',
        },
        sizeMedium: {
          height: 36,
          padding: '0 16px',
          fontSize: '0.875rem',
        },
        sizeLarge: {
          height: 44,
          padding: '0 24px',
          fontSize: '1rem',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        maxWidth: 'sm' as const,
        fullWidth: true,
      },
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          height: 24,
          fontSize: '0.6875rem',
          borderRadius: '9999px',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small' as const,
        variant: 'outlined' as const,
        fullWidth: true,
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#00C2B9',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#00C2B9',
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 700,
          minHeight: 40,
          padding: '8px 14px',
          fontSize: '0.875rem',
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
          borderRadius: '3px 3px 0 0',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          fontSize: '0.75rem',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 700,
          fontSize: '0.75rem',
          padding: '5px 12px',
          borderRadius: 10,
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          gap: 0,
        },
      },
    },
  },
};

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: 'light',
    primary: {
      main: '#002C51',
    },
    secondary: {
      main: '#00C2B9',
    },
    background: {
      default: '#f4f7fb',
      paper: '#FFFFFF',
    },
    divider: 'rgba(15, 23, 42, 0.08)',
  },
});

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: {
      main: '#dbeafe',
    },
    secondary: {
      main: '#00C2B9',
    },
    background: {
      default: '#071524',
      paper: '#0b1d2d',
    },
    divider: 'rgba(148, 163, 184, 0.16)',
  },
});
