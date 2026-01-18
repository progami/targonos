'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from '@/lib/lucide-icons'
import { withoutBasePath } from '@/lib/utils/base-path'

export function Breadcrumb() {
 const pathname = usePathname()
 const normalizedPathname = withoutBasePath(pathname)
 
 // Don't show breadcrumbs on home or login pages
 if (normalizedPathname === '/' || normalizedPathname === '/auth/login') {
 return null
 }

 // Parse the pathname into segments
 const segments = normalizedPathname.split('/').filter(Boolean)

 // Create breadcrumb items
 const breadcrumbs = segments.map((segment, index) => {
 const href = '/' + segments.slice(0, index + 1).join('/')
 const previousSegment = index > 0 ? segments[index - 1] : null
 const nextSegment = index < segments.length - 1 ? segments[index + 1] : null

 // Skip warehouse IDs in breadcrumbs (they don't have their own page)
 // Warehouse IDs appear after 'warehouses' and before 'rates' or 'edit'
 const isWarehouseId = previousSegment === 'warehouses' && nextSegment !== null && ['edit', 'rates'].includes(nextSegment)
 const isOperationsRoot = segment === 'operations'

 // Handle special cases for better labels
 let label = segment
 switch (segment) {
 case 'operations':
 label = 'Operations'
 break
 case 'finance':
 label = 'Ledgers'
 break
 case 'config':
 label = 'Configuration'
 break
 case 'integrations':
 label = 'Integrations'
 break
 case 'transactions':
 label = 'Transactions'
 break
 case 'inventory':
 label = 'Inventory Ledger'
 break
 default:
 // For IDs and other segments, format them nicely
 if (segment.match(/^[a-f0-9-]+$/i) && segment.length > 20) {
 // Looks like an ID, truncate it
 label = segment.substring(0, 8) + '...'
 } else {
 label = segment
 .split('-')
 .map(word => word.charAt(0).toUpperCase() + word.slice(1))
 .join(' ')
 }
 }

 return { href, label, skip: isWarehouseId || isOperationsRoot }
 }).filter(item => !item.skip)

 const homeLink = '/dashboard'

  return (
  <nav className="flex items-center space-x-1 text-sm text-slate-600 dark:text-slate-400 mb-4">
  <Link
  href={homeLink}
  className="flex items-center hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
  >
  <Home className="h-4 w-4" />
  </Link>
  
  {breadcrumbs.map((breadcrumb, index) => (
  <div key={breadcrumb.href} className="flex items-center">
  <ChevronRight className="h-4 w-4 mx-1 text-slate-400 dark:text-slate-500" />
  {index === breadcrumbs.length - 1 ? (
  <span className="font-medium text-slate-900 dark:text-slate-100">
  {breadcrumb.label}
  </span>
  ) : (
  <Link
  href={breadcrumb.href}
  className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
  >
  {breadcrumb.label}
  </Link>
  )}
  </div>
  ))}
  </nav>
  )
}
