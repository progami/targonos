'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { SnackbarProvider } from 'notistack';
import { argusDarkTheme, argusLightTheme } from '@targon/theme';

function MuiThemeSync({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = mounted && resolvedTheme === 'dark' ? argusDarkTheme : argusLightTheme;

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </MuiThemeProvider>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NextThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <MuiThemeSync>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          autoHideDuration={3200}
        >
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </SnackbarProvider>
      </MuiThemeSync>
    </NextThemeProvider>
  );
}
