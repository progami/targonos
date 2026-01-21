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
            {/* App branding - LEFT */}
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

            {/* Targon branding - RIGHT */}
            <div className={cn("flex items-center transition-all duration-300", isTabletCollapsed && "md:hidden lg:flex")}>
              <svg viewBox="0 0 2048 537" height="24" aria-label="Targon" className="shrink-0">
                <path d="M 1013.000 430.041 L 1000.000 430.263 L 983.000 429.271 L 965.000 426.395 L 953.000 423.250 L 939.000 418.408 L 928.000 413.336 L 914.000 405.353 L 900.000 395.266 L 888.000 384.601 L 877.427 373.000 L 869.845 363.000 L 861.629 350.000 L 853.937 334.000 L 848.757 319.000 L 845.679 306.000 L 843.593 292.000 L 842.817 278.000 L 843.534 257.000 L 845.810 242.000 L 848.678 230.000 L 853.566 216.000 L 861.768 199.000 L 869.450 187.000 L 879.617 174.000 L 891.000 162.399 L 901.000 153.789 L 914.000 144.507 L 928.000 136.520 L 946.000 128.742 L 962.000 123.626 L 975.000 120.717 L 991.000 118.582 L 1010.000 117.966 L 1027.000 118.792 L 1042.000 120.729 L 1055.000 123.528 L 1072.000 128.794 L 1090.000 136.693 L 1104.000 144.576 L 1115.000 152.646 L 1123.000 159.611 L 1131.028 168.000 L 1133.594 171.000 L 1133.842 172.000 L 1083.000 222.587 L 1070.000 209.492 L 1060.000 201.651 L 1055.000 198.644 L 1045.000 193.519 L 1038.000 190.829 L 1030.000 188.594 L 1018.000 186.733 L 998.000 186.554 L 984.000 188.675 L 977.000 190.736 L 969.000 193.792 L 960.000 198.612 L 955.000 201.827 L 946.000 209.285 L 939.682 216.000 L 933.780 224.000 L 929.554 231.000 L 924.585 243.000 L 921.720 254.000 L 920.823 260.000 L 920.188 272.000 L 920.524 284.000 L 921.647 294.000 L 923.718 303.000 L 926.777 312.000 L 929.537 318.000 L 934.708 327.000 L 939.315 333.000 L 944.601 339.000 L 953.000 346.351 L 964.000 353.353 L 971.000 356.456 L 979.000 359.183 L 988.000 361.241 L 1004.000 362.436 L 1022.000 361.246 L 1031.000 359.303 L 1040.000 356.248 L 1046.000 353.349 L 1054.000 348.366 L 1063.303 340.000 L 1069.270 332.000 L 1073.303 325.000 L 1076.981 316.000 L 1076.000 314.944 L 1000.000 313.056 L 997.000 312.917 L 996.019 312.000 L 996.019 252.000 L 996.271 251.000 L 997.000 250.602 L 1158.000 250.602 L 1158.885 252.000 L 1158.471 278.000 L 1157.282 293.000 L 1154.398 311.000 L 1151.481 323.000 L 1146.193 339.000 L 1138.332 356.000 L 1130.403 369.000 L 1122.133 380.000 L 1112.862 390.000 L 1101.000 400.439 L 1086.000 410.438 L 1070.000 418.341 L 1055.000 423.504 L 1044.000 426.377 L 1026.000 429.232 L 1013.000 430.041 Z M 1353.000 431.027 L 1342.000 431.177 L 1319.000 429.237 L 1305.000 426.484 L 1294.000 423.442 L 1280.000 418.288 L 1264.000 410.423 L 1251.000 402.353 L 1238.000 392.415 L 1227.000 381.971 L 1217.490 371.000 L 1207.635 357.000 L 1199.466 342.000 L 1194.600 331.000 L 1188.735 312.000 L 1186.619 302.000 L 1184.567 283.000 L 1184.637 263.000 L 1186.502 246.000 L 1189.532 232.000 L 1194.699 216.000 L 1199.611 205.000 L 1207.431 191.000 L 1215.736 179.000 L 1227.770 165.000 L 1239.000 154.569 L 1252.000 144.802 L 1266.000 136.534 L 1278.000 130.924 L 1289.000 126.627 L 1299.000 123.533 L 1311.000 120.716 L 1325.000 118.582 L 1336.000 117.768 L 1352.000 117.642 L 1367.000 118.557 L 1381.000 120.703 L 1394.000 123.754 L 1409.000 128.850 L 1426.000 136.486 L 1440.000 144.697 L 1452.406 154.000 L 1465.000 165.701 L 1476.403 179.000 L 1486.395 194.000 L 1492.239 205.000 L 1497.397 217.000 L 1502.415 232.000 L 1505.172 244.000 L 1507.482 262.000 L 1507.702 279.000 L 1507.259 289.000 L 1504.369 308.000 L 1499.395 326.000 L 1492.319 343.000 L 1484.268 358.000 L 1478.198 367.000 L 1468.000 379.693 L 1455.626 392.000 L 1445.000 400.545 L 1430.000 410.259 L 1414.000 418.218 L 1400.000 423.449 L 1389.000 426.486 L 1374.000 429.359 L 1353.000 431.027 Z M 176.000 425.083 L 175.000 425.500 L 101.000 425.500 L 99.629 425.000 L 99.428 189.000 L 98.000 188.625 L 8.000 188.625 L 7.250 188.000 L 7.250 137.000 L 7.272 124.000 L 8.000 123.190 L 267.000 123.190 L 268.000 123.259 L 268.590 124.000 L 268.607 188.000 L 268.000 188.578 L 177.000 188.625 L 176.317 189.000 L 176.000 425.083 Z M 552.000 425.477 L 474.000 425.500 L 473.041 425.000 L 457.315 379.000 L 455.062 373.000 L 454.000 372.595 L 343.000 372.595 L 341.558 375.000 L 323.973 425.000 L 323.000 425.500 L 247.000 425.500 L 245.917 425.000 L 363.000 123.458 L 436.000 123.190 L 437.304 124.000 L 543.269 400.000 L 552.302 424.000 L 552.518 425.000 L 552.000 425.477 Z M 832.000 425.477 L 745.000 425.407 L 665.446 308.000 L 662.628 304.000 L 661.000 303.183 L 658.000 303.335 L 657.596 304.000 L 657.596 425.000 L 657.000 425.500 L 582.000 425.500 L 581.203 425.000 L 581.203 125.000 L 581.221 124.000 L 582.000 123.190 L 714.000 123.190 L 724.000 123.613 L 738.000 125.740 L 750.000 128.885 L 757.000 131.495 L 768.000 136.734 L 776.000 141.601 L 783.000 146.801 L 795.182 159.000 L 800.460 166.000 L 803.470 171.000 L 808.183 181.000 L 811.302 191.000 L 813.177 202.000 L 813.649 210.000 L 813.218 224.000 L 811.308 235.000 L 808.156 245.000 L 803.476 255.000 L 795.418 267.000 L 790.000 273.086 L 782.000 280.303 L 775.000 285.284 L 765.000 291.164 L 753.000 296.162 L 744.000 298.737 L 741.284 300.000 L 831.495 423.000 L 832.793 425.000 L 832.000 425.477 Z M 1811.000 425.426 L 1756.000 425.500 L 1754.201 425.000 L 1623.000 258.548 L 1622.356 260.000 L 1622.356 425.000 L 1621.000 425.500 L 1547.000 425.500 L 1545.777 425.000 L 1546.000 123.682 L 1547.000 123.190 L 1599.000 123.264 L 1606.358 132.000 L 1734.000 293.971 L 1734.750 292.000 L 1734.773 124.000 L 1736.000 123.190 L 1811.000 123.290 L 1811.426 125.000 L 1811.426 425.000 L 1811.000 425.426 Z M 707.671 248.000 L 716.000 246.346 L 721.000 244.396 L 724.985 242.000 L 731.363 236.000 L 735.062 230.000 L 737.381 223.000 L 738.208 218.000 L 738.329 213.000 L 736.242 202.000 L 733.326 196.000 L 729.000 190.607 L 723.000 185.668 L 717.000 182.672 L 710.000 180.644 L 701.000 179.846 L 658.000 180.017 L 657.596 181.000 L 657.654 248.000 L 659.000 248.457 L 701.000 248.457 L 707.671 248.000 Z M 1359.929 362.000 L 1365.000 361.339 L 1376.000 358.420 L 1382.000 356.219 L 1393.000 350.276 L 1402.000 343.471 L 1408.000 337.518 L 1416.512 326.000 L 1422.168 315.000 L 1424.472 309.000 L 1427.250 299.000 L 1429.237 286.000 L 1429.703 275.000 L 1429.387 263.000 L 1428.218 255.000 L 1424.289 239.000 L 1419.187 227.000 L 1416.358 222.000 L 1411.414 215.000 L 1406.000 209.012 L 1398.000 201.682 L 1394.000 198.881 L 1385.000 193.670 L 1378.000 190.698 L 1372.000 188.641 L 1363.000 186.733 L 1355.000 185.648 L 1349.000 185.452 L 1337.000 185.643 L 1329.000 186.733 L 1320.000 188.617 L 1312.000 191.396 L 1307.000 193.601 L 1298.000 198.682 L 1291.000 203.829 L 1285.000 209.506 L 1280.361 215.000 L 1275.568 222.000 L 1271.765 229.000 L 1267.661 239.000 L 1264.641 250.000 L 1263.839 255.000 L 1262.675 265.000 L 1262.448 275.000 L 1262.792 284.000 L 1264.532 298.000 L 1266.713 307.000 L 1269.586 315.000 L 1277.697 330.000 L 1286.000 339.996 L 1296.000 348.441 L 1304.000 353.433 L 1310.000 356.368 L 1318.000 359.218 L 1327.000 361.384 L 1343.000 362.664 L 1359.929 362.000 Z M 433.599 312.000 L 431.469 304.000 L 400.476 214.000 L 399.000 212.125 L 365.833 306.000 L 364.319 311.000 L 364.482 312.000 L 433.599 312.000 Z" fill="#002C51" fillRule="evenodd"/>
                <path d="M 1941.338 298.000 L 2048.002 298.000 L 2048.002 426.002 L 1920.000 426.002 L 1920.000 319.338 A 21.338 21.338 0 0 1 1941.338 298.000 Z" fill="#00C2B9"/>
              </svg>
            </div>
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

          {/* Sidebar Footer - Region, Theme, Logout */}
          <div className={cn(
            "mt-auto pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2",
            isTabletCollapsed && "md:hidden lg:block"
          )}>
            {/* Region Indicator */}
            <TenantIndicator collapsed={isTabletCollapsed} showLogout={false} />

            {/* Theme Toggle */}
            <ThemeToggle collapsed={isTabletCollapsed} />

            {/* Logout Button */}
            <button
              onClick={() => {
                const url = portalUrl('/api/auth/signout')
                url.searchParams.set('callbackUrl', `${window.location.origin}${withBasePath('/auth/login')}`)
                window.location.href = url.toString()
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              {!isTabletCollapsed && <span className="text-sm">Sign out</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="sticky top-0 z-40 flex items-center gap-x-4 bg-white dark:bg-slate-900 px-4 py-4 shadow-soft border-b border-slate-200 dark:border-slate-700 sm:px-6 md:hidden">
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
        {/* Targon branding - RIGHT on mobile */}
        <svg viewBox="0 0 128 128" width="24" height="24" aria-label="Targon" className="shrink-0">
          <rect x="0" y="0" width="128" height="128" rx="21" fill="#00C2B9" />
        </svg>
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
                <div className="flex h-16 shrink-0 items-center justify-between">
                  {/* App branding - LEFT */}
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
                  {/* Targon branding - RIGHT */}
                  <svg viewBox="0 0 128 128" width="24" height="24" aria-label="Targon" className="shrink-0">
                    <rect x="0" y="0" width="128" height="128" rx="21" fill="#00C2B9" />
                  </svg>
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

                {/* Mobile Sidebar Footer - Region, Theme, Logout */}
                <div className="mt-auto pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2 -mx-2">
                  <TenantIndicator showLogout={false} />
                  <ThemeToggle />
                  <button
                    onClick={() => {
                      const url = portalUrl('/api/auth/signout')
                      url.searchParams.set('callbackUrl', `${window.location.origin}${withBasePath('/auth/login')}`)
                      window.location.href = url.toString()
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <LogOut className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                    <span className="text-sm">Sign out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
