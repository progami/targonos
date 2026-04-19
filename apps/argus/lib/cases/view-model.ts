import type {
  CaseReportActionKind,
  CaseReportBundle,
  CaseReportCaseRecord,
  CaseReportRow,
  CaseReportSection,
} from './reader-core'

const CASE_SELECTOR_CATEGORY_ORDER = ['Action due', 'New case', 'Forum watch', 'Watching'] as const

export type CaseReportDateOption = {
  reportDate: string
  label: string
}

export type CaseSelectorRow = {
  caseId: string
  category: string
  issue: string
  entity: string
  amazonStatus: string | null
  openSince: string | null
  activityCount: number
  evidence: string
  assessment: string
  nextStep: string
  nextAction: string | null
}

export type CaseTimelineRow = CaseReportRow & {
  timelineKey: string
  reportDate: string
  entity: string
  signal: string
}

export type CaseDetailApprovalModel = {
  statusLabel: 'Approval required'
  sourceLabel: string
  primaryActionLabel: 'Approve send'
  secondaryActionLabel: 'Hold'
}

export type CaseDetailMetadata = {
  entity: string
  amazonStatus: string | null
  ourStatus: string | null
  lastReply: string | null
  created: string | null
  linkedCases: string | null
  primaryEmail: string | null
  nextAction: string | null
  nextActionDate: string | null
  actionKind: CaseReportActionKind | null
  approvalRequired: boolean | null
}

export type CaseDetailModel = {
  reportDate: string
  caseId: string
  category: string
  issue: string
  status: string
  signal: string
  evidence: string
  assessment: string
  nextStep: string
  metadata: CaseDetailMetadata
  approval: CaseDetailApprovalModel | null
}

function getCaseSelectorCategoryRank(category: string): number {
  const rank = CASE_SELECTOR_CATEGORY_ORDER.indexOf(category as (typeof CASE_SELECTOR_CATEGORY_ORDER)[number])
  if (rank === -1) {
    throw new Error(`Unsupported case selector category: ${category}`)
  }
  return rank
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

function isTrackedCaseId(bundle: CaseReportBundle, caseId: string): boolean {
  return bundle.trackedCaseIds.includes(caseId)
}

function getTrackedCaseRecordOrThrow(
  bundle: CaseReportBundle,
  caseId: string,
  context: string,
): CaseReportCaseRecord | undefined {
  const caseRecord = bundle.caseRecordsById[caseId]
  if (caseRecord === undefined && isTrackedCaseId(bundle, caseId)) {
    throw new Error(`Missing case record for ${context}: ${caseId}`)
  }
  return caseRecord
}

function assertTrackedCaseRecordInvariant(bundle: CaseReportBundle, caseId: string, context: string): void {
  getTrackedCaseRecordOrThrow(bundle, caseId, context)
}

function getReportSectionsForDate(bundle: CaseReportBundle, reportDate: string): CaseReportSection[] {
  const sections = bundle.reportSectionsByDate[reportDate]
  if (sections === undefined) {
    throw new Error(`Missing report sections for report date: ${reportDate}`)
  }
  return sections
}

function getCaseRowsForDate(
  bundle: CaseReportBundle,
  reportDate: string,
  caseId: string,
): Array<{ entity: string; row: CaseReportRow }> {
  const sections = getReportSectionsForDate(bundle, reportDate)

  return sections.flatMap((section) =>
    section.rows
      .filter((row) => row.caseId === caseId)
      .map((row) => ({
        entity: section.entity,
        row,
      })),
  )
}

function getSingleCaseRowForDate(
  bundle: CaseReportBundle,
  reportDate: string,
  caseId: string,
): { entity: string; row: CaseReportRow } | null {
  const matches = getCaseRowsForDate(bundle, reportDate, caseId)
  if (matches.length === 0) {
    return null
  }
  if (matches.length > 1) {
    throw new Error(`Multiple report rows found for case ${caseId} on ${reportDate}`)
  }
  return matches[0]
}

function buildCaseTimelineRow(caseId: string, reportDate: string, entry: { entity: string; row: CaseReportRow }): CaseTimelineRow {
  return {
    ...entry.row,
    timelineKey: `${reportDate}::${caseId}`,
    reportDate,
    entity: entry.entity,
    signal: entry.row.evidence,
  }
}

function getApprovalSourceLabel(actionKind: CaseReportActionKind): string {
  switch (actionKind) {
    case 'send_email':
      return 'Email'
    case 'send_case_reply':
      return 'Case reply'
    case 'send_forum_post':
      return 'Forum post'
    case 'monitor':
      throw new Error(`Approval is not supported for action kind: ${actionKind}`)
    case 'checkpoint':
      throw new Error(`Approval is not supported for action kind: ${actionKind}`)
    case 'collect_evidence':
      throw new Error(`Approval is not supported for action kind: ${actionKind}`)
  }
}

function createCaseDetailApprovalModel(caseRecord: CaseReportCaseRecord): CaseDetailApprovalModel | null {
  if (caseRecord.approvalRequired === false) {
    return null
  }

  return {
    statusLabel: 'Approval required',
    sourceLabel: getApprovalSourceLabel(caseRecord.actionKind),
    primaryActionLabel: 'Approve send',
    secondaryActionLabel: 'Hold',
  }
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

export function createCaseSelectorRows(bundle: CaseReportBundle): CaseSelectorRow[] {
  return bundle.sections
    .flatMap((section) =>
      section.rows.map((row) => {
        const caseRecord = getTrackedCaseRecordOrThrow(bundle, row.caseId, 'case selector row')
        const amazonStatus = caseRecord === undefined ? null : caseRecord.amazonStatus
        const openSince = caseRecord === undefined ? null : caseRecord.created
        const nextAction = caseRecord === undefined ? null : caseRecord.nextAction

        return {
          caseId: row.caseId,
          category: row.category,
          issue: row.issue,
          entity: section.entity,
          amazonStatus,
          openSince,
          activityCount: createCaseTimelineRows(bundle, row.caseId).length,
          evidence: row.evidence,
          assessment: row.assessment,
          nextStep: row.nextStep,
          nextAction,
        }
      }),
    )
    .sort((left, right) => {
      const categoryRank = getCaseSelectorCategoryRank(left.category) - getCaseSelectorCategoryRank(right.category)
      if (categoryRank !== 0) {
        return categoryRank
      }

      return left.caseId.localeCompare(right.caseId)
    })
}

export function createCaseTimelineRows(bundle: CaseReportBundle, caseId: string): CaseTimelineRow[] {
  assertTrackedCaseRecordInvariant(bundle, caseId, 'case timeline')

  const rows = [...bundle.availableReportDates]
    .sort((left, right) => right.localeCompare(left))
    .flatMap((reportDate) => {
      const entry = getSingleCaseRowForDate(bundle, reportDate, caseId)
      if (entry === null) {
        return []
      }

      return buildCaseTimelineRow(caseId, reportDate, entry)
    })

  if (rows.length === 0) {
    throw new Error(`Missing case timeline rows for case: ${caseId}`)
  }

  return rows
}

export function createCaseDetailModel(bundle: CaseReportBundle, timelineRow: CaseTimelineRow): CaseDetailModel {
  const caseRecord = getTrackedCaseRecordOrThrow(bundle, timelineRow.caseId, 'case detail')
  const entity = caseRecord === undefined ? timelineRow.entity : caseRecord.entity
  const amazonStatus = caseRecord === undefined ? null : caseRecord.amazonStatus
  const ourStatus = caseRecord === undefined ? null : caseRecord.ourStatus
  const lastReply = caseRecord === undefined ? null : caseRecord.lastReply
  const created = caseRecord === undefined ? null : caseRecord.created
  const linkedCases = caseRecord === undefined ? null : caseRecord.linkedCases
  const primaryEmail = caseRecord === undefined ? null : caseRecord.primaryEmail
  const nextAction = caseRecord === undefined ? null : caseRecord.nextAction
  const nextActionDate = caseRecord === undefined ? null : caseRecord.nextActionDate
  const actionKind = caseRecord === undefined ? null : caseRecord.actionKind
  const approvalRequired = caseRecord === undefined ? null : caseRecord.approvalRequired

  return {
    reportDate: timelineRow.reportDate,
    caseId: timelineRow.caseId,
    category: timelineRow.category,
    issue: timelineRow.issue,
    status: timelineRow.status,
    signal: timelineRow.signal,
    evidence: timelineRow.evidence,
    assessment: timelineRow.assessment,
    nextStep: timelineRow.nextStep,
    metadata: {
      entity,
      amazonStatus,
      ourStatus,
      lastReply,
      created,
      linkedCases,
      primaryEmail,
      nextAction,
      nextActionDate,
      actionKind,
      approvalRequired,
    },
    approval: caseRecord === undefined ? null : createCaseDetailApprovalModel(caseRecord),
  }
}

export function filterCaseSelectorRows(rows: CaseSelectorRow[], query: string): CaseSelectorRow[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery === '') {
    return rows
  }

  return rows.filter((row) => {
    const searchableFields = [
      row.issue,
      row.caseId,
      row.entity,
      row.evidence,
      row.assessment,
      row.nextStep,
    ]

    if (row.nextAction !== null) {
      searchableFields.push(row.nextAction)
    }

    return searchableFields.some((field) => field.toLowerCase().includes(normalizedQuery))
  })
}
