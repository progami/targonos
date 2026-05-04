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
  subject: string
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

export type CaseDetailSourceLink = {
  label: 'Case thread' | 'Forum thread'
  href: string
}

export type CaseDetailMetadata = {
  entity: string
  amazonStatus: string | null
  ourStatus: string | null
  lastReply: string | null
  created: string | null
  nextAction: string | null
  nextActionDate: string | null
  actionKind: CaseReportActionKind | null
  approvalRequired: boolean | null
}

export type CaseDetailModel = {
  reportDate: string
  caseId: string
  subject: string
  category: string
  issue: string
  status: string
  signal: string
  evidence: string
  assessment: string
  nextStep: string
  metadata: CaseDetailMetadata
  sourceLinks: CaseDetailSourceLink[]
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

function compareCaseEntries(
  left: { row: CaseReportRow },
  right: { row: CaseReportRow },
): number {
  const categoryRank = getCaseSelectorCategoryRank(left.row.category) - getCaseSelectorCategoryRank(right.row.category)
  if (categoryRank !== 0) {
    return categoryRank
  }

  const issueRank = left.row.issue.localeCompare(right.row.issue)
  if (issueRank !== 0) {
    return issueRank
  }

  return left.row.status.localeCompare(right.row.status)
}

function getSortedCaseRowsForDate(
  bundle: CaseReportBundle,
  reportDate: string,
  caseId: string,
): Array<{ entity: string; row: CaseReportRow }> {
  return getCaseRowsForDate(bundle, reportDate, caseId).sort(compareCaseEntries)
}

function buildCaseTimelineRow(
  caseId: string,
  reportDate: string,
  entryIndex: number,
  entry: { entity: string; row: CaseReportRow },
): CaseTimelineRow {
  return {
    ...entry.row,
    timelineKey: `${reportDate}::${caseId}::${entryIndex}`,
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
    case 'verify_credit':
      throw new Error(`Approval is not supported for action kind: ${actionKind}`)
    case 'verify_reimbursement':
      throw new Error(`Approval is not supported for action kind: ${actionKind}`)
    case 'catalog_reparent':
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

function createCaseDetailSourceLinks(caseRecord: CaseReportCaseRecord | undefined): CaseDetailSourceLink[] {
  if (caseRecord === undefined) {
    return []
  }

  const sourceLinks: CaseDetailSourceLink[] = []

  if (caseRecord.caseUrl !== null) {
    sourceLinks.push({
      label: 'Case thread',
      href: caseRecord.caseUrl,
    })
  }

  if (caseRecord.forumPostUrl !== null) {
    sourceLinks.push({
      label: 'Forum thread',
      href: caseRecord.forumPostUrl,
    })
  }

  return sourceLinks
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
  const selectorEntriesByCaseId = new Map<string, Array<{ entity: string; row: CaseReportRow }>>()

  bundle.sections.forEach((section) => {
    section.rows.forEach((row) => {
      const existingEntries = selectorEntriesByCaseId.get(row.caseId)
      if (existingEntries === undefined) {
        selectorEntriesByCaseId.set(row.caseId, [{ entity: section.entity, row }])
        return
      }

      existingEntries.push({ entity: section.entity, row })
    })
  })

  return [...selectorEntriesByCaseId.entries()]
    .map(([caseId, entries]) => {
      const entry = [...entries].sort(compareCaseEntries)[0]
      const caseRecord = getTrackedCaseRecordOrThrow(bundle, caseId, 'case selector row')
      const subject = caseRecord === undefined ? entry.row.issue : caseRecord.title
      const amazonStatus = caseRecord === undefined ? null : caseRecord.amazonStatus
      const openSince = caseRecord === undefined ? null : caseRecord.created
      const nextAction = caseRecord === undefined ? null : caseRecord.nextAction

      return {
        caseId,
        subject,
        category: entry.row.category,
        issue: entry.row.issue,
        entity: entry.entity,
        amazonStatus,
        openSince,
        activityCount: createCaseTimelineRows(bundle, caseId).length,
        evidence: entry.row.evidence,
        assessment: entry.row.assessment,
        nextStep: entry.row.nextStep,
        nextAction,
      }
    })
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
      const entries = getSortedCaseRowsForDate(bundle, reportDate, caseId)
      if (entries.length === 0) {
        return []
      }

      return entries.map((entry, entryIndex) => buildCaseTimelineRow(caseId, reportDate, entryIndex, entry))
    })

  if (rows.length === 0) {
    throw new Error(`Missing case timeline rows for case: ${caseId}`)
  }

  return rows
}

export function createCaseDetailModel(bundle: CaseReportBundle, timelineRow: CaseTimelineRow): CaseDetailModel {
  const caseRecord = getTrackedCaseRecordOrThrow(bundle, timelineRow.caseId, 'case detail')
  const subject = caseRecord === undefined ? timelineRow.issue : caseRecord.title
  const entity = caseRecord === undefined ? timelineRow.entity : caseRecord.entity
  const amazonStatus = caseRecord === undefined ? null : caseRecord.amazonStatus
  const ourStatus = caseRecord === undefined ? null : caseRecord.ourStatus
  const lastReply = caseRecord === undefined ? null : caseRecord.lastReply
  const created = caseRecord === undefined ? null : caseRecord.created
  const nextAction = caseRecord === undefined ? null : caseRecord.nextAction
  const nextActionDate = caseRecord === undefined ? null : caseRecord.nextActionDate
  const actionKind = caseRecord === undefined ? null : caseRecord.actionKind
  const approvalRequired = caseRecord === undefined ? null : caseRecord.approvalRequired

  return {
    reportDate: timelineRow.reportDate,
    caseId: timelineRow.caseId,
    subject,
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
      nextAction,
      nextActionDate,
      actionKind,
      approvalRequired,
    },
    sourceLinks: createCaseDetailSourceLinks(caseRecord),
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
      row.subject,
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
