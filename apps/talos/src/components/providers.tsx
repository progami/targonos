'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'
import { useState } from 'react'
import { CSRFProvider } from '@/components/providers/csrf-provider'
// import { ErrorBoundary } from './error-boundary'
// import { logErrorToService } from '@/lib/logger/client'

const ThemeProviderWithChildren = NextThemesProvider as unknown as React.ComponentType<
  React.PropsWithChildren<ThemeProviderProps>
>

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProviderWithChildren
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <CSRFProvider>{children}</CSRFProvider>
      </ThemeProviderWithChildren>
    </QueryClientProvider>
  )
}

export default Providers
