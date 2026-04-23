import type { LucideIcon } from 'lucide-react'
import {
  Package,
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
    name: 'SKU Info',
    href: '/amazon/fba-fee-discrepancies',
    description: 'Review SKU packaging, Amazon dimensions, fees, and listing inputs.',
    note: 'Catalog',
    icon: Package,
    matchMode: 'prefix',
  },
] as const
