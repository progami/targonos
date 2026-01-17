'use client'

import { usePathname } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CommandPalette } from '@/components/search/command-palette'

const DISABLED_PATHS = new Set<string>(['/', '/500'])
const DISABLED_PATH_PREFIXES = ['/auth', '/no-access', '/unauthorized', '/test']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDisabled =
    DISABLED_PATHS.has(pathname) || DISABLED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (isDisabled) return <>{children}</>

  return (
    <>
      <DashboardLayout>{children}</DashboardLayout>
      <CommandPalette />
    </>
  )
}
