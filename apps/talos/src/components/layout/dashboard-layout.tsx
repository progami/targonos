'use client'

import { createContext, useContext } from 'react'
import { MainNav } from './main-nav'
import { Breadcrumb } from '@/components/ui/breadcrumb'

const DashboardLayoutNestingContext = createContext(false)

interface DashboardLayoutProps {
 children: React.ReactNode
 hideBreadcrumb?: boolean
 customBreadcrumb?: React.ReactNode
}

export function DashboardLayout({ children, hideBreadcrumb = false, customBreadcrumb }: DashboardLayoutProps) {
 const isNested = useContext(DashboardLayoutNestingContext)
 if (isNested) return <>{children}</>

const appName = 'Talos'
 const year = new Date().getFullYear()
 const version = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0'
	 const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL || undefined
	 const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA || undefined
	 const commitUrl = commitSha ? `https://github.com/progami/targonos/commit/${commitSha}` : undefined
	 const inferredReleaseUrl = `https://github.com/progami/targonos/releases/tag/v${version}`
	 const href = explicitReleaseUrl ?? commitUrl ?? inferredReleaseUrl
 
 return (
 <DashboardLayoutNestingContext.Provider value={true}>
 <MainNav />
 <div className="md:pl-16 lg:pl-64 transition-all duration-300 h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
 <main className="flex-1 flex flex-col min-h-0">
 <div className="px-4 sm:px-6 md:px-8 py-4">
 {hideBreadcrumb ? customBreadcrumb ?? null : customBreadcrumb ?? <Breadcrumb />}
 </div>
 <div className="flex-1 flex flex-col px-4 sm:px-6 md:px-8 pb-4 min-h-0 overflow-y-auto scrollbar-gutter-stable">
 {children}
 </div>
 </main>
 <footer className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
 <div className="px-4 sm:px-6 md:px-8 py-4">
 <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
 {appName}{' '}
 {href ? (
 <a
 href={href}
 target="_blank"
 rel="noopener noreferrer"
 className="hover:text-cyan-600 underline transition-colors"
 >
 v{version}
 </a>
 ) : (
 <span>v{version}</span>
 )}
 {' '}• © {year} {appName}
 </p>
 </div>
 </footer>
 </div>
 </DashboardLayoutNestingContext.Provider>
 )
}
