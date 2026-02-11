import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Providers from '@/components/providers'
import { Toaster } from 'react-hot-toast'
import '@/lib/utils/patch-fetch'
import FetchPatch from '@/components/fetch-patch'
import AppShell from '@/components/layout/app-shell'

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? ''

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Talos',
  description: 'Modern warehouse inventory and billing management',
  keywords: ['warehouse', 'inventory', 'billing', 'management', '3PL'],
  icons: {
    icon: [
      { url: `${appBasePath || ''}/favicon.ico` },
      { url: `${appBasePath || ''}/favicon.svg`, type: 'image/svg+xml' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <FetchPatch />
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
