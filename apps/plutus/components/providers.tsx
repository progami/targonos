'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { SnackbarProvider } from 'notistack';
import { useEffect, useState, type ReactNode } from 'react';

import { lightTheme, darkTheme } from '@/lib/mui-theme';
import { NavigationHistoryProvider } from '@/lib/navigation-history';
import { resolveMuiThemeMode } from '@/lib/theme-mode';

type ProvidersProps = {
  children?: ReactNode;
};

function MuiThemeSync({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const themeMode = resolveMuiThemeMode(mounted, resolvedTheme);
  const muiTheme = themeMode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NextThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <MuiThemeSync>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          autoHideDuration={3000}
        >
          <QueryClientProvider client={queryClient}>
            <NavigationHistoryProvider>{children}</NavigationHistoryProvider>
          </QueryClientProvider>
        </SnackbarProvider>
      </MuiThemeSync>
    </NextThemeProvider>
  );
}
