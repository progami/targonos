import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  Building,
  FileText,
  Home,
  Package,
  Shield,
  Truck,
  Users,
} from '@/lib/lucide-icons'
import { AMAZON_WORKSPACE_TOOLS, type NavigationMatchMode } from '@/lib/amazon/workspace'

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
  matchMode: NavigationMatchMode
}

export type NavSection = {
  title: string
  items: NavItem[]
}

type NavigationContext = {
  isPlatformAdmin: boolean
}

function createItem(
  name: string,
  href: string,
  icon: LucideIcon,
  matchMode: NavigationMatchMode = 'prefix'
): NavItem {
  return {
    name,
    href,
    icon,
    matchMode,
  }
}

export function buildMainNavigation(context: NavigationContext): NavSection[] {
  const amazonItems = AMAZON_WORKSPACE_TOOLS.map((tool) =>
    createItem(tool.name, tool.href, tool.icon, tool.matchMode)
  )

  const configurationItems = [
    createItem('Products', '/config/products', Package),
    createItem('Suppliers', '/config/suppliers', Users),
    createItem('Warehouses', '/config/warehouses', Building),
  ]

  if (context.isPlatformAdmin) {
    configurationItems.push(createItem('Permissions', '/config/permissions', Shield))
  }

  return [
    {
      title: '',
      items: [createItem('Dashboard', '/dashboard', Home)],
    },
    {
      title: 'Amazon',
      items: amazonItems,
    },
    {
      title: 'Operations',
      items: [
        createItem('Purchase Orders', '/operations/purchase-orders', FileText),
        createItem('Fulfillment Orders', '/operations/fulfillment-orders', Truck),
        createItem('Inventory Ledger', '/operations/inventory', BookOpen),
        createItem('Storage Ledger', '/operations/storage-ledger', Building),
        createItem('Financial Ledger', '/operations/financial-ledger', BarChart3),
      ],
    },
    {
      title: 'Configuration',
      items: configurationItems,
    },
  ]
}

export function isNavigationItemActive(
  pathname: string,
  item: Pick<NavItem, 'href' | 'matchMode'>
): boolean {
  const [targetPath] = item.href.split('?')

  if (item.matchMode === 'exact') {
    return pathname === targetPath
  }

  return pathname === targetPath || pathname.startsWith(`${targetPath}/`)
}
