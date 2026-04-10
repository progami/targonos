import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Calculator,
  Truck,
} from '@/lib/lucide-icons'

export type NavigationMatchMode = 'prefix' | 'exact'

export type AmazonWorkspaceTool = {
  name: string
  href: string
  description: string
  note: string
  icon: LucideIcon
  matchMode: NavigationMatchMode
}

export const AMAZON_WORKSPACE_TOOLS: AmazonWorkspaceTool[] = [
  {
    name: 'FBA Fee Discrepancies',
    href: '/amazon/fba-fee-discrepancies',
    description: 'Compare reference packaging against Amazon fee inputs and isolate mismatches fast.',
    note: 'Audit',
    icon: Activity,
    matchMode: 'prefix',
  },
  {
    name: 'FBA Fee Tables',
    href: '/amazon/fba-fee-tables',
    description: 'Reference the live Amazon rate cards without leaving Talos.',
    note: 'Reference',
    icon: Calculator,
    matchMode: 'prefix',
  },
  {
    name: 'Shipment Planning',
    href: '/market/shipment-planning',
    description: 'Prioritize FBA replenishment using days-of-stock and suggested carton moves.',
    note: 'Planning',
    icon: Truck,
    matchMode: 'prefix',
  },
] as const
