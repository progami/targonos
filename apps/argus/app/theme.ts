'use client'

import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: {
      main: '#002C51',
      light: '#3385cd',
      dark: '#001f3a',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#00C2B9',
      light: '#33d7cf',
      dark: '#008d86',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#dc2626',
    },
    warning: {
      main: '#d97706',
    },
    success: {
      main: '#16a34a',
    },
    background: {
      default: '#f7f8f9',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#002C51',
      secondary: '#6F7B8B',
    },
    divider: '#dde1e5',
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeightBold: 700,
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    overline: {
      fontWeight: 600,
      letterSpacing: '0.08em',
      fontSize: '0.7rem',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          borderColor: '#dde1e5',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            fontWeight: 600,
            color: '#6F7B8B',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid #dde1e5',
          backgroundColor: '#FFFFFF',
        },
      },
    },
  },
})
