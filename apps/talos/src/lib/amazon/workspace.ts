import type { LucideIcon } from 'lucide-react'
import {
  Activity,
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
] as const
