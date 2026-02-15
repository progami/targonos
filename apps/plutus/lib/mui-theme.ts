import { createTheme } from '@mui/material/styles';

const shared = {
  typography: {
    fontFamily: 'var(--font-sans), Outfit, system-ui, sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true as const,
      },
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 500,
          borderRadius: 8,
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
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
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
          fontWeight: 500,
          height: 22,
          fontSize: '0.6875rem',
          borderRadius: '6px',
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
              borderColor: '#45B3D4',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#00C2B9',
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontSize: '0.875rem',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#45B3D4',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00C2B9',
            borderWidth: 2,
          },
        },
      },
    },
    MuiFormControl: {
      defaultProps: {
        size: 'small' as const,
        fullWidth: true,
      },
    },
    MuiSwitch: {
      defaultProps: {
        size: 'small' as const,
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 500,
          minHeight: 40,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(0, 0, 0, 0.06)',
        },
        head: {
          height: 44,
          padding: '0 12px',
          fontSize: '0.75rem',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
        },
        body: {
          padding: '12px',
          fontVariantNumeric: 'tabular-nums' as const,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(248, 250, 252, 0.8)',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.15s',
          '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.02)' },
        },
      },
    },
    MuiSkeleton: {
      defaultProps: {
        variant: 'rectangular' as const,
        animation: 'pulse' as const,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
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
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontSize: '0.875rem',
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
      main: '#0b273f',
    },
    secondary: {
      main: '#45B3D4',
    },
    background: {
      default: '#F8FAFC',
      paper: '#FFFFFF',
    },
    divider: 'rgba(0, 0, 0, 0.08)',
  },
});

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: {
      main: '#45B3D4',
    },
    secondary: {
      main: '#00C2B9',
    },
    background: {
      default: '#0B1120',
      paper: '#111827',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  },
  components: {
    ...shared.components,
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
        },
        head: {
          ...(shared.components.MuiTableCell.styleOverrides.head),
        },
        body: {
          ...(shared.components.MuiTableCell.styleOverrides.body),
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.15s',
          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
        },
      },
    },
  },
});
