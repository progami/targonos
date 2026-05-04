'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
import { SnackbarProvider } from 'notistack';
import { argusDarkTheme } from '@targon/theme';

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NextThemeProvider attribute="class" forcedTheme="dark">
      <MuiThemeProvider theme={argusDarkTheme}>
        <CssBaseline enableColorScheme />
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          autoHideDuration={3200}
        >
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </SnackbarProvider>
      </MuiThemeProvider>
    </NextThemeProvider>
  );
}
