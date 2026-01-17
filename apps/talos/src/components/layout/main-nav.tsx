'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import {
 Home,
 Package,
 FileText,
 Truck,
 LogOut,
 Menu,
 X,
 BarChart3,
 DollarSign,
 Building,
 BookOpen,
 Calendar,
 Users,
 ChevronRight,
 Search,
} from '@/lib/lucide-icons'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { portalUrl } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { TenantIndicator } from '@/components/tenant/TenantIndicator'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface NavSection {
 title: string
 items: Array<{
 name: string
 href: string
 icon: React.ComponentType<{ className?: string }>
 }>
}

const baseNavigation: NavSection[] = [
 {
 title: '',
 items: [
 { name: 'Dashboard', href: '/dashboard', icon: Home },
 ]
 },
 {
 title: 'Amazon',
 items: [
 { name: 'FBA Fee Discrepancies', href: '/amazon/fba-fee-discrepancies', icon: DollarSign },
 ]
 },
 {
 title: 'Operations',
 items: [
 { name: 'Purchase Orders', href: '/operations/purchase-orders', icon: FileText },
 { name: 'Fulfillment Orders', href: '/operations/fulfillment-orders', icon: Truck },
 { name: 'Inventory Ledger', href: '/operations/inventory', icon: BookOpen },
 { name: 'Storage Ledger', href: '/operations/storage-ledger', icon: Calendar },
 { name: 'Cost Ledger', href: '/operations/cost-ledger', icon: BarChart3 },
 ]
 },
 {
 title: 'Configuration',
 items: [
 { name: 'Products', href: '/config/products', icon: Package },
      { name: 'Suppliers', href: '/config/suppliers', icon: Users },
      { name: 'Warehouses', href: '/config/warehouses', icon: Building },
 ]
 },
]


// LocalStorage key for persisting collapsed sections
const COLLAPSED_SECTIONS_KEY = 'talos-nav-collapsed-sections'

export function MainNav() {
 const pathname = usePathname()
 const { data: session } = useSession()
 const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
 const [isTabletCollapsed, setIsTabletCollapsed] = useState(false)
 const [userMenuOpen, setUserMenuOpen] = useState(false)
 const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

 // Load collapsed sections from localStorage on mount
 useEffect(() => {
   try {
     const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY)
     if (saved) {
       setCollapsedSections(JSON.parse(saved))
     }
   } catch {
     // Ignore localStorage errors
   }
 }, [])

 // Toggle section collapse state
 const toggleSection = useCallback((sectionTitle: string) => {
   setCollapsedSections(prev => {
     const newState = { ...prev, [sectionTitle]: !prev[sectionTitle] }
     try {
       localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(newState))
     } catch {
       // Ignore localStorage errors
     }
     return newState
   })
 }, [])

 // Close user menu when clicking outside
 useEffect(() => {
 const handleClickOutside = (event: MouseEvent) => {
 if (userMenuOpen && !(event.target as HTMLElement).closest('.user-menu-container')) {
 setUserMenuOpen(false)
 }
 }

 document.addEventListener('mousedown', handleClickOutside)
 return () => document.removeEventListener('mousedown', handleClickOutside)
 }, [userMenuOpen])

 if (!session) return null
 
 // Use base navigation for all users
 const userNavigation = baseNavigation

 // Get current page name for mobile header
 const matchesPath = (href: string) => {
 const [targetPath] = href.split('?')
 return pathname.startsWith(targetPath)
 }

 const getCurrentPageName = () => {
 for (const section of userNavigation) {
 for (const item of section.items) {
 if (matchesPath(item.href)) {
 return item.name
 }
 }
 }
 return 'Dashboard'
 }

 return (
 <>
 {/* Desktop Navigation - responsive for tablets */}
 <div className={cn(
 "hidden md:fixed md:inset-y-0 md:z-50 md:flex md:flex-col transition-all duration-300",
 isTabletCollapsed ? "md:w-16 lg:w-64" : "md:w-64"
 )}>
       <div className="flex grow flex-col gap-y-3 overflow-y-auto scrollbar-gutter-stable border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 pb-3">
 <div className="flex h-16 shrink-0 items-center justify-between">
 <div className="flex items-center gap-3">
 <Link href="/dashboard" scroll={false} prefetch={false} className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-dark shadow-md">
   <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
     <path
       d="M 32.00 8.00 L 52.78 20.00 L 52.78 44.00 L 32.00 56.00 L 11.22 44.00 L 11.22 20.00 Z M 29.00 17.00 L 35.00 17.00 L 35.00 47.00 L 29.00 47.00 Z"
       fill="#00C2B9"
       fillRule="evenodd"
     />
   </svg>
 </div>
              <span className={cn("text-lg font-semibold text-slate-900 dark:text-slate-100 transition-all duration-300", isTabletCollapsed && "md:hidden lg:inline")}>Talos</span>
 </Link>
 </div>

 {/* User info and tablet collapse */}
 <div className="flex items-center gap-2">
 {/* Search button */}
 <button
 onClick={() => {
 // Dispatch keyboard event to open command palette
 window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
 }}
 className={cn(
 "p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
 isTabletCollapsed && "md:hidden lg:block"
 )}
 title="Search (⌘K)"
 >
 <Search className="h-5 w-5 text-slate-500 dark:text-slate-400" />
 </button>
 {/* User avatar/menu */}
 <div className={cn("relative transition-all duration-300 user-menu-container", isTabletCollapsed && "md:hidden lg:block")}>
 <button
 onClick={() => setUserMenuOpen(!userMenuOpen)}
                 className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
 >
 <div className="h-7 w-7 rounded-full bg-cyan-600/10 flex items-center justify-center">
 <span className="text-xs font-medium text-cyan-700 ">
 {session.user.name?.charAt(0).toUpperCase()}
 </span>
 </div>
 </button>
 {/* Dropdown menu */}
 {userMenuOpen && (
                 <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-soft-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                 <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                 <p className="text-xs text-slate-500 dark:text-slate-400">Signed in as</p>
                 <p className="text-sm font-medium truncate dark:text-slate-100">{session.user.name}</p>
                 <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{session.user.email}</p>
 </div>
 
                 <button
                 onClick={() => {
                 const url = portalUrl('/api/auth/signout')
                 url.searchParams.set('callbackUrl', `${window.location.origin}${withBasePath('/auth/login')}`)
                 window.location.href = url.toString()
                 }}
                 className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 dark:text-slate-200"
                 >
 <LogOut className="h-4 w-4" />
 Sign out
 </button>
 </div>
 )}
 </div>
 
 {/* Tablet collapse button */}
 <button
 onClick={() => setIsTabletCollapsed(!isTabletCollapsed)}
                 className="hidden md:block lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
 >
 <Menu className="h-5 w-5" />
 </button>
 </div>
 </div>

         {/* Tenant/Region Indicator */}
         <div className={cn(
           "border-b border-slate-200 dark:border-slate-700 pb-3 -mx-2",
           isTabletCollapsed && "md:hidden lg:block"
         )}>
           <TenantIndicator collapsed={isTabletCollapsed} />
         </div>

         {/* Theme Toggle */}
         <div className={cn(
           "border-b border-slate-200 dark:border-slate-700 pb-3 -mx-2",
           isTabletCollapsed && "md:hidden lg:block"
         )}>
           <ThemeToggle collapsed={isTabletCollapsed} />
         </div>

         <nav className="flex flex-1 flex-col">
 <ul role="list" className="flex flex-1 flex-col gap-y-7">
 <li>
 <ul role="list" className="-mx-2 space-y-3">
 {userNavigation.map((section, sectionIdx) => {
 const isCollapsed = section.title ? collapsedSections[section.title] : false
 const hasActiveItem = section.items.some(item => matchesPath(item.href))
 
 return (
 <li key={sectionIdx}>
 {section.title && (
 <button
 onClick={() => toggleSection(section.title)}
 className={cn(
 "w-full flex items-center justify-between px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.1em] text-cyan-700/70 dark:text-cyan-400/70 transition-all duration-300 hover:text-cyan-800 dark:hover:text-cyan-300 rounded",
 isTabletCollapsed && "md:hidden lg:flex"
 )}
 aria-expanded={!isCollapsed}
 >
 <span>{section.title}</span>
 <span className={cn(
   "transition-transform duration-200",
   isCollapsed ? "" : "rotate-90"
 )}>
   <ChevronRight className="h-3 w-3" />
 </span>
 </button>
 )}
 <ul 
   role="list" 
   className={cn(
     "space-y-1 overflow-hidden transition-all duration-200",
     section.title && isCollapsed && !hasActiveItem ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
   )}
 >
 {section.items.map((item) => (
 <li key={item.name}>
 <Link
 href={item.href}
 scroll={false}
 prefetch={false}
 className={cn(
 matchesPath(item.href)
 ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-900 dark:text-cyan-300'
 : 'text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-slate-800',
 'group flex gap-x-3 rounded-lg py-2 px-3 text-sm leading-5 font-medium transition-all duration-200'
 )}
 >
 <item.icon
 className={cn(
 matchesPath(item.href)
 ? 'text-cyan-600 dark:text-cyan-400'
 : 'text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400',
 'h-5 w-5 shrink-0'
 )}
 aria-hidden="true"
 />
 <span className={cn(
 "transition-all duration-300",
 isTabletCollapsed && "md:hidden lg:inline"
 )}>
 {item.name}
 </span>
 </Link>
 </li>
 ))}
 </ul>
 </li>
 )
 })}
 </ul>
 </li>
 </ul>
 </nav>
 </div>
 </div>

 {/* Mobile Navigation */}
 <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white dark:bg-slate-900 px-4 py-4 shadow-soft border-b border-slate-200 dark:border-slate-700 sm:px-6 md:hidden">
 <button
 type="button"
 className="-m-2.5 p-2.5 text-slate-700 dark:text-slate-300"
 onClick={() => setMobileMenuOpen(true)}
 >
 <span className="sr-only">Open sidebar</span>
 <Menu className="h-6 w-6" aria-hidden="true" />
 </button>
 <div className="flex-1 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
 {getCurrentPageName()}
 </div>
 </div>

 {/* Mobile menu overlay */}
 {mobileMenuOpen && (
 <div className="relative z-50 lg:hidden">
 <div
 className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm"
 onClick={() => setMobileMenuOpen(false)}
 />
 <div className="fixed inset-0 flex">
 <div className="relative mr-16 flex w-full max-w-xs flex-1">
 <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
 <button
 type="button"
 className="-m-2.5 p-2.5"
 onClick={() => setMobileMenuOpen(false)}
 >
 <span className="sr-only">Close sidebar</span>
 <X className="h-6 w-6 text-white" aria-hidden="true" />
 </button>
 </div>
 <div className="flex grow flex-col gap-y-5 overflow-y-auto scrollbar-gutter-stable bg-white dark:bg-slate-900 px-6 pb-4">
 <div className="flex h-16 shrink-0 items-center">
 <Link href="/dashboard" scroll={false} prefetch={false} className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-dark shadow-md">
   <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
     <path
       d="M 32.00 8.00 L 52.78 20.00 L 52.78 44.00 L 32.00 56.00 L 11.22 44.00 L 11.22 20.00 Z M 29.00 17.00 L 35.00 17.00 L 35.00 47.00 L 29.00 47.00 Z"
       fill="#00C2B9"
       fillRule="evenodd"
     />
   </svg>
 </div>
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">Talos</span>
 </Link>
 </div>

 {/* Tenant/Region Indicator - Mobile */}
 <div className="border-b border-slate-200 dark:border-slate-700 pb-3 -mx-2">
 <TenantIndicator />
 </div>

 {/* Theme Toggle - Mobile */}
 <div className="border-b border-slate-200 dark:border-slate-700 pb-3 -mx-2">
 <ThemeToggle />
 </div>

 <nav className="flex flex-1 flex-col">
 <ul role="list" className="flex flex-1 flex-col gap-y-7">
 <li>
 <ul role="list" className="-mx-2 space-y-3">
 {userNavigation.map((section, sectionIdx) => (
 <li key={sectionIdx}>
 {section.title && (
 <div className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.1em] text-cyan-700/70 dark:text-cyan-400/70">
 {section.title}
 </div>
 )}
 <ul role="list" className="space-y-1">
 {section.items.map((item) => (
 <li key={item.name}>
 <Link
 href={item.href}
 scroll={false}
 prefetch={false}
 className={cn(
 matchesPath(item.href)
 ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-900 dark:text-cyan-300'
 : 'text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-slate-800',
 'group flex gap-x-3 rounded-lg py-2 px-3 text-sm leading-5 font-medium transition-all duration-200'
 )}
 onClick={() => setMobileMenuOpen(false)}
 >
 <item.icon
 className={cn(
 matchesPath(item.href)
 ? 'text-cyan-600 dark:text-cyan-400'
 : 'text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400',
 'h-5 w-5 shrink-0'
 )}
 aria-hidden="true"
 />
 {item.name}
 </Link>
 </li>
 ))}
 </ul>
 </li>
 ))}
 </ul>
 </li>
 </ul>
 </nav>
 </div>
 </div>
 </div>
 </div>
 )}
 </>
 )
}
