'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { CSRFProvider } from '@/components/providers/csrf-provider'
// import { ErrorBoundary } from './error-boundary'
// import { logErrorToService } from '@/lib/logger/client'

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
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <CSRFProvider>{children}</CSRFProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default Providers
