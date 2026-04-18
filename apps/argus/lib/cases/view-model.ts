import type { CaseReportBundle, CaseReportRow } from './reader-core'

const CASE_APPROVAL_CATEGORY_ORDER = ['Action due', 'New case', 'Forum watch', 'Watching'] as const

export type CaseApprovalDecision = 'pending' | 'approved' | 'rejected'
export type CaseReportDateOption = {
  reportDate: string
  label: string
}

export type CaseApprovalRow = CaseReportRow & {
  rowKey: string
  entity: string
  decision: CaseApprovalDecision
}

export type CaseApprovalFilters = {
  decision: CaseApprovalDecision | 'all'
  query: string
}

function getCaseApprovalCategoryRank(category: string): number {
  const rank = CASE_APPROVAL_CATEGORY_ORDER.indexOf(category as (typeof CASE_APPROVAL_CATEGORY_ORDER)[number])
  if (rank === -1) {
    throw new Error(`Unsupported case approval category: ${category}`)
  }
  return rank
}

function parseCaseAgeInDays(daysAgo: string): number {
  const match = /^(\d+) day/u.exec(daysAgo)
  if (match === null) {
    throw new Error(`Unsupported case age label: ${daysAgo}`)
  }
  return Number.parseInt(match[1], 10)
}

function buildCaseApprovalRowKey(entity: string, row: CaseReportRow, index: number): string {
  return `${entity}::${row.caseId}::${row.issue}::${index}`
}

function buildCaseReportDateLabel(summary: CaseReportBundle['daySummaries'][number]): string {
  const segments = [`${summary.totalRows} total`]

  if (summary.actionDueRows > 0) {
    segments.push(`${summary.actionDueRows} action due`)
  }

  if (summary.newCaseRows > 0) {
    segments.push(`${summary.newCaseRows} new`)
  }

  if (summary.forumWatchRows > 0) {
    segments.push(`${summary.forumWatchRows} forum`)
  }

  if (summary.watchingRows > 0) {
    segments.push(`${summary.watchingRows} watching`)
  }

  return `${summary.reportDate} · ${segments.join(' · ')}`
}

export function createCaseReportDateOptions(
  bundle: Pick<CaseReportBundle, 'availableReportDates' | 'daySummaries'>,
): CaseReportDateOption[] {
  const summaryByReportDate = new Map(
    bundle.daySummaries.map((summary) => [summary.reportDate, summary] as const),
  )

  return bundle.availableReportDates.map((reportDate) => {
    const summary = summaryByReportDate.get(reportDate)
    if (summary === undefined) {
      throw new Error(`Missing day summary for report date: ${reportDate}`)
    }

    return {
      reportDate,
      label: buildCaseReportDateLabel(summary),
    }
  })
}

export function createCaseApprovalRows(bundle: CaseReportBundle): CaseApprovalRow[] {
  return bundle.sections
    .flatMap((section) =>
      section.rows.map((row, index) => ({
        ...row,
        rowKey: buildCaseApprovalRowKey(section.entity, row, index),
        entity: section.entity,
        decision: 'pending' as const,
      })),
    )
    .sort((left, right) => {
      const categoryRank = getCaseApprovalCategoryRank(left.category) - getCaseApprovalCategoryRank(right.category)
      if (categoryRank !== 0) {
        return categoryRank
      }

      return parseCaseAgeInDays(right.daysAgo) - parseCaseAgeInDays(left.daysAgo)
    })
}

export function matchesCaseApprovalSearch(row: CaseApprovalRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery === '') {
    return true
  }

  return [
    row.issue,
    row.assessment,
    row.nextStep,
    row.caseId,
    row.entity,
  ].some((field) => field.toLowerCase().includes(normalizedQuery))
}

export function filterCaseApprovalRows(
  rows: CaseApprovalRow[],
  filters: CaseApprovalFilters,
): CaseApprovalRow[] {
  return rows.filter((row) => {
    if (filters.decision !== 'all' && row.decision !== filters.decision) {
      return false
    }

    return matchesCaseApprovalSearch(row, filters.query)
  })
}
