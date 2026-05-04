'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CommandPalette } from '@/components/search/command-palette'

const DISABLED_PATHS = new Set<string>(['/', '/500'])
const DISABLED_PATH_PREFIXES = ['/auth', '/no-access', '/unauthorized', '/test']
const HIDE_BREADCRUMB_PATHS = new Set<string>(['/dashboard', '/talos/dashboard'])

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [hasMounted, setHasMounted] = useState(false)
  const shouldHideBreadcrumb = hasMounted && HIDE_BREADCRUMB_PATHS.has(pathname)
  const isDisabled =
    DISABLED_PATHS.has(pathname) ||
    DISABLED_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))

  useEffect(() => {
    setHasMounted(true)
  }, [])

  if (isDisabled) return <>{children}</>

  return (
    <>
      <DashboardLayout hideBreadcrumb={shouldHideBreadcrumb}>{children}</DashboardLayout>
      <CommandPalette />
    </>
  )
}
