'use client';

import { useEffect, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Toaster } from 'sonner';

import { TooltipProvider } from '@/components/ui/tooltip';
import { lightTheme, darkTheme } from '@/lib/mui-theme';
import { resolveMuiThemeMode } from '@/lib/theme-mode';

type ProvidersProps = {
  // Accept any React tree so we can bridge the React 18/19 type mismatch in this workspace
  children?:
    | ComponentProps<typeof QueryClientProvider>['children']
    | ReactNode
    | null
    | undefined
    | any;
};

type ThemeProviderProps = ComponentProps<typeof NextThemeProvider> & { children?: ReactNode };
const NextTheme = NextThemeProvider as unknown as (props: ThemeProviderProps) => ReactElement;

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
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      toastOptions={{
        duration: 3000,
        classNames: {
          toast: 'font-sans text-sm shadow-lg border',
          success:
            'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
          error:
            'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800',
          info: 'bg-cyan-50 text-cyan-900 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-100 dark:border-cyan-800',
          warning:
            'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
        },
      }}
    />
  );
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NextTheme attribute="class" defaultTheme="light" enableSystem>
      <MuiThemeSync>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={100}>
            {children}
            <ThemedToaster />
          </TooltipProvider>
        </QueryClientProvider>
      </MuiThemeSync>
    </NextTheme>
  );
}
