'use client'

type CaseApprovalQueueTableProps = {
  rows: unknown[]
  selectedRowKey: string | null
  onSelectRow: (rowKey: string) => void
  onDecision: (rowKey: string, decision: 'approved' | 'rejected') => void
}

export function CaseApprovalQueueTable(_props: CaseApprovalQueueTableProps) {
  return null
}
