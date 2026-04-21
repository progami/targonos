import { promises as fs } from 'node:fs';
import path from 'node:path';

const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const CASE_REPORT_ACTION_KINDS = [
  'monitor',
  'checkpoint',
  'collect_evidence',
  'send_email',
  'send_case_reply',
  'send_forum_post',
] as const;

const CASE_MARKETS = {
  us: {
    marketCode: 'US',
    label: 'USA - Dust Sheets',
    caseRoot:
      '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/cases',
  },
  uk: {
    marketCode: 'UK',
    label: 'UK - Dust Sheets',
    caseRoot:
      '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - UK/Cases',
  },
} as const;

export type CaseReportMarketSlug = keyof typeof CASE_MARKETS;

export type CaseReportRow = {
  category: string;
  issue: string;
  caseId: string;
  daysAgo: string;
  status: string;
  evidence: string;
  assessment: string;
  nextStep: string;
};

export type CaseReportSection = {
  entity: string;
  rows: CaseReportRow[];
};

export type ParsedCaseReport = {
  reportDate: string;
  marketCode: string;
  sections: CaseReportSection[];
};

export type CaseReportDaySummary = {
  reportDate: string;
  totalRows: number;
  actionDueRows: number;
  newCaseRows: number;
  forumWatchRows: number;
  watchingRows: number;
};

export type CaseReportActionKind = (typeof CASE_REPORT_ACTION_KINDS)[number];

export type CaseReportCaseRecord = {
  caseId: string;
  title: string;
  entity: string;
  amazonStatus: string;
  ourStatus: string;
  created: string;
  lastReply: string;
  nextAction: string;
  nextActionDate: string;
  linkedCases: string;
  primaryEmail: string | null;
  caseUrl: string | null;
  forumPost: string | null;
  forumPostUrl: string | null;
  actionKind: CaseReportActionKind;
  approvalRequired: boolean;
};

export type CaseReportBundle = ParsedCaseReport & {
  marketSlug: CaseReportMarketSlug;
  marketLabel: string;
  caseRoot: string;
  reportPath: string;
  caseJsonPath: string;
  availableReportDates: string[];
  reportSectionsByDate: Record<string, CaseReportSection[]>;
  daySummaries: CaseReportDaySummary[];
  trackedCaseIds: string[];
  caseRecordsById: Record<string, CaseReportCaseRecord>;
  generatedAt: string | null;
};

function resolveMarketConfig(marketSlug: CaseReportMarketSlug) {
  const market = CASE_MARKETS[marketSlug];
  if (market === undefined) {
    throw new Error(`Unsupported case report market: ${marketSlug}`);
  }
  return market;
}

function readRequiredObject(
  value: unknown,
  errorMessage: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  record: Record<string, unknown>,
  fieldName: string,
  errorMessage: string,
): string {
  const value = record[fieldName];
  if (typeof value !== 'string') {
    throw new Error(errorMessage);
  }

  return value;
}

function readRequiredBoolean(
  record: Record<string, unknown>,
  fieldName: string,
  errorMessage: string,
): boolean {
  const value = record[fieldName];
  if (typeof value !== 'boolean') {
    throw new Error(errorMessage);
  }

  return value;
}

function readRequiredArray(
  record: Record<string, unknown>,
  fieldName: string,
  errorMessage: string,
): unknown[] {
  const value = record[fieldName];
  if (Array.isArray(value) === false) {
    throw new Error(errorMessage);
  }

  return value;
}

function readRequiredStringArray(
  record: Record<string, unknown>,
  fieldName: string,
  missingErrorMessage: string,
  invalidErrorMessage: string,
): string[] {
  const value = record[fieldName];
  if (value === undefined) {
    throw new Error(missingErrorMessage);
  }
  if (Array.isArray(value) === false) {
    throw new Error(invalidErrorMessage);
  }
  if (value.every((entry) => typeof entry === 'string') === false) {
    throw new Error(invalidErrorMessage);
  }

  return value;
}

function readNullableString(
  record: Record<string, unknown>,
  fieldName: string,
): string | null {
  const value = record[fieldName];
  if (typeof value !== 'string') {
    return null;
  }

  return value;
}

function readOptionalUrl(
  record: Record<string, unknown>,
  fieldName: string,
  invalidErrorMessage: string,
): string | null {
  const value = record[fieldName];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(invalidErrorMessage);
  }

  const trimmedValue = value.trim();
  if (trimmedValue === '') {
    throw new Error(invalidErrorMessage);
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    throw new Error(invalidErrorMessage);
  }
}

function isCaseReportActionKind(value: string): value is CaseReportActionKind {
  return CASE_REPORT_ACTION_KINDS.some((actionKind) => actionKind === value);
}

function actionKindAllowsApproval(actionKind: CaseReportActionKind): boolean {
  switch (actionKind) {
    case 'send_email':
      return true;
    case 'send_case_reply':
      return true;
    case 'send_forum_post':
      return true;
    case 'monitor':
      return false;
    case 'checkpoint':
      return false;
    case 'collect_evidence':
      return false;
  }
}

function parseCaseRecord(rawCaseId: string, value: unknown): CaseReportCaseRecord {
  const record = readRequiredObject(value, `Invalid case.json case record for case ${rawCaseId}`);
  const caseId = readRequiredString(
    record,
    'case_id',
    `Missing required case.json case field case_id for case ${rawCaseId}`,
  );
  if (caseId !== rawCaseId) {
    throw new Error(`Case.json case key mismatch: expected ${rawCaseId}, got ${caseId}`);
  }

  const actionKind = readRequiredString(
    record,
    'action_kind',
    `Missing required case.json case field action_kind for case ${rawCaseId}`,
  );
  if (isCaseReportActionKind(actionKind) === false) {
    throw new Error(`Invalid case.json action_kind ${actionKind} for case ${rawCaseId}`);
  }
  const approvalRequired = readRequiredBoolean(
    record,
    'approval_required',
    `Missing required case.json case field approval_required for case ${rawCaseId}`,
  );
  if (approvalRequired === true && actionKindAllowsApproval(actionKind) === false) {
    throw new Error(
      `Invalid case.json approval_required true for non-send action_kind ${actionKind} for case ${rawCaseId}`,
    );
  }

  return {
    caseId,
    title: readRequiredString(
      record,
      'title',
      `Missing required case.json case field title for case ${rawCaseId}`,
    ),
    entity: readRequiredString(
      record,
      'entity',
      `Missing required case.json case field entity for case ${rawCaseId}`,
    ),
    amazonStatus: readRequiredString(
      record,
      'amazon_status',
      `Missing required case.json case field amazon_status for case ${rawCaseId}`,
    ),
    ourStatus: readRequiredString(
      record,
      'our_status',
      `Missing required case.json case field our_status for case ${rawCaseId}`,
    ),
    created: readRequiredString(
      record,
      'created',
      `Missing required case.json case field created for case ${rawCaseId}`,
    ),
    lastReply: readRequiredString(
      record,
      'last_reply',
      `Missing required case.json case field last_reply for case ${rawCaseId}`,
    ),
    nextAction: readRequiredString(
      record,
      'next_action',
      `Missing required case.json case field next_action for case ${rawCaseId}`,
    ),
    nextActionDate: readRequiredString(
      record,
      'next_action_date',
      `Missing required case.json case field next_action_date for case ${rawCaseId}`,
    ),
    linkedCases: readRequiredString(
      record,
      'linked_cases',
      `Missing required case.json case field linked_cases for case ${rawCaseId}`,
    ),
    primaryEmail: readNullableString(record, 'primary_email'),
    caseUrl: readOptionalUrl(
      record,
      'case_url',
      `Invalid case.json case field case_url for case ${rawCaseId}`,
    ),
    forumPost: readNullableString(record, 'forum_post'),
    forumPostUrl: readOptionalUrl(
      record,
      'forum_post_url',
      `Invalid case.json case field forum_post_url for case ${rawCaseId}`,
    ),
    actionKind,
    approvalRequired,
  };
}

function parseCaseRecordsById(
  value: unknown,
  trackedCaseIds: string[],
): Record<string, CaseReportCaseRecord> {
  const cases = readRequiredObject(value, 'Missing required case.json cases map');

  return Object.fromEntries(
    trackedCaseIds.map((caseId) => {
      const caseRecord = cases[caseId];
      if (caseRecord === undefined) {
        throw new Error(`Missing required case.json case record for case ${caseId}`);
      }

      return [caseId, parseCaseRecord(caseId, caseRecord)] as const;
    }),
  );
}

function parseCaseReportSnapshotRow(
  value: unknown,
  sectionEntity: string,
  rowIndex: number,
): CaseReportRow {
  const row = readRequiredObject(
    value,
    `Invalid case report snapshot row ${rowIndex} for section ${sectionEntity}`,
  );

  return {
    category: readRequiredString(
      row,
      'category',
      `Missing required case report snapshot row field category for section ${sectionEntity} row ${rowIndex}`,
    ),
    issue: readRequiredString(
      row,
      'issue',
      `Missing required case report snapshot row field issue for section ${sectionEntity} row ${rowIndex}`,
    ),
    caseId: readRequiredString(
      row,
      'case_id',
      `Missing required case report snapshot row field case_id for section ${sectionEntity} row ${rowIndex}`,
    ),
    daysAgo: readRequiredString(
      row,
      'days_ago',
      `Missing required case report snapshot row field days_ago for section ${sectionEntity} row ${rowIndex}`,
    ),
    status: readRequiredString(
      row,
      'status',
      `Missing required case report snapshot row field status for section ${sectionEntity} row ${rowIndex}`,
    ),
    evidence: readRequiredString(
      row,
      'evidence',
      `Missing required case report snapshot row field evidence for section ${sectionEntity} row ${rowIndex}`,
    ),
    assessment: readRequiredString(
      row,
      'assessment',
      `Missing required case report snapshot row field assessment for section ${sectionEntity} row ${rowIndex}`,
    ),
    nextStep: readRequiredString(
      row,
      'next_step',
      `Missing required case report snapshot row field next_step for section ${sectionEntity} row ${rowIndex}`,
    ),
  };
}

function parseCaseReportSnapshotSection(value: unknown, sectionIndex: number): CaseReportSection {
  const section = readRequiredObject(value, `Invalid case report snapshot section ${sectionIndex}`);
  const entity = readRequiredString(
    section,
    'entity',
    `Missing required case report snapshot section field entity at index ${sectionIndex}`,
  );
  const rows = readRequiredArray(
    section,
    'rows',
    `Missing required case report snapshot section rows at index ${sectionIndex}`,
  ).map((row, rowIndex) => parseCaseReportSnapshotRow(row, entity, rowIndex));

  if (rows.length === 0) {
    throw new Error(`Case report snapshot section ${entity} contains no rows`);
  }

  return {
    entity,
    rows,
  };
}

export function parseCaseReportSnapshotJson(snapshotJson: string): ParsedCaseReport {
  const snapshot = readRequiredObject(
    JSON.parse(snapshotJson),
    'Invalid case report snapshot root object',
  );
  const reportDate = readRequiredString(
    snapshot,
    'report_date',
    'Missing required case report snapshot field report_date',
  );
  if (REPORT_DATE_PATTERN.test(reportDate) === false) {
    throw new Error(`Invalid case report snapshot date: ${reportDate}`);
  }
  const marketCode = readRequiredString(
    snapshot,
    'market',
    'Missing required case report snapshot field market',
  );
  const sections = readRequiredArray(
    snapshot,
    'sections',
    'Missing required case report snapshot field sections',
  ).map((section, sectionIndex) => parseCaseReportSnapshotSection(section, sectionIndex));

  if (sections.length === 0) {
    throw new Error('Case report snapshot contains no entity sections.');
  }

  return {
    reportDate,
    marketCode,
    sections,
  };
}

async function listAvailableReportDates(caseRoot: string): Promise<string[]> {
  const reportsDir = path.join(caseRoot, 'reports');
  const entries = await fs.readdir(reportsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => fileName.replace(/\.json$/u, ''))
    .filter((reportDate) => REPORT_DATE_PATTERN.test(reportDate))
    .sort((left, right) => right.localeCompare(left));
}

function countCaseReportRows(parsedReport: ParsedCaseReport): CaseReportDaySummary {
  const summary: CaseReportDaySummary = {
    reportDate: parsedReport.reportDate,
    totalRows: 0,
    actionDueRows: 0,
    newCaseRows: 0,
    forumWatchRows: 0,
    watchingRows: 0,
  };

  for (const section of parsedReport.sections) {
    for (const row of section.rows) {
      summary.totalRows += 1;

      if (row.category === 'Action due') {
        summary.actionDueRows += 1;
        continue;
      }

      if (row.category === 'New case') {
        summary.newCaseRows += 1;
        continue;
      }

      if (row.category === 'Forum watch') {
        summary.forumWatchRows += 1;
        continue;
      }

      if (row.category === 'Watching') {
        summary.watchingRows += 1;
        continue;
      }

      throw new Error(`Unsupported case report summary category: ${row.category}`);
    }
  }

  return summary;
}

async function readParsedReportsByDate(
  caseRoot: string,
  availableReportDates: string[],
  marketCode: string,
): Promise<Record<string, ParsedCaseReport>> {
  const reports = await Promise.all(
    availableReportDates.map(async (reportDate) => {
      const reportPath = path.join(caseRoot, 'reports', `${reportDate}.json`);
      const snapshotJson = await fs.readFile(reportPath, 'utf8');
      const parsedReport = parseCaseReportSnapshotJson(snapshotJson);

      if (parsedReport.reportDate !== reportDate) {
        throw new Error(`Case report date mismatch: expected ${reportDate}, got ${parsedReport.reportDate}`);
      }

      if (parsedReport.marketCode !== marketCode) {
        throw new Error(`Case report market mismatch: expected ${marketCode}, got ${parsedReport.marketCode}`);
      }

      return [reportDate, parsedReport] as const;
    }),
  );

  return Object.fromEntries(reports);
}

function readParsedReportByDate(
  parsedReportsByDate: Record<string, ParsedCaseReport>,
  reportDate: string,
): ParsedCaseReport {
  const parsedReport = parsedReportsByDate[reportDate];
  if (parsedReport === undefined) {
    throw new Error(`Missing parsed case report for date ${reportDate}`);
  }

  return parsedReport;
}

function buildCaseReportDaySummaries(
  parsedReportsByDate: Record<string, ParsedCaseReport>,
  availableReportDates: string[],
): CaseReportDaySummary[] {
  return availableReportDates.map((reportDate) =>
    countCaseReportRows(readParsedReportByDate(parsedReportsByDate, reportDate)),
  );
}

function buildReportSectionsByDate(
  parsedReportsByDate: Record<string, ParsedCaseReport>,
  availableReportDates: string[],
): Record<string, CaseReportSection[]> {
  return Object.fromEntries(
    availableReportDates.map((reportDate) => [
      reportDate,
      readParsedReportByDate(parsedReportsByDate, reportDate).sections,
    ]),
  );
}

export async function readCaseReportBundleFromCaseRoot(
  caseRoot: string,
  marketSlug: CaseReportMarketSlug,
  requestedReportDate?: string,
): Promise<CaseReportBundle> {
  const market = resolveMarketConfig(marketSlug);
  const availableReportDates = await listAvailableReportDates(caseRoot);
  if (availableReportDates.length === 0) {
    throw new Error(`No case reports found in ${caseRoot}`);
  }

  const reportDate = requestedReportDate ?? availableReportDates[0];
  if (REPORT_DATE_PATTERN.test(reportDate) === false) {
    throw new Error(`Invalid case report date: ${reportDate}`);
  }

  const reportPath = path.join(caseRoot, 'reports', `${reportDate}.json`);
  const caseJsonPath = path.join(caseRoot, 'case.json');
  if (requestedReportDate !== undefined && availableReportDates.includes(reportDate) === false) {
    await fs.readFile(reportPath, 'utf8');
  }

  const [caseJsonRaw, parsedReportsByDate] = await Promise.all([
    fs.readFile(caseJsonPath, 'utf8'),
    readParsedReportsByDate(caseRoot, availableReportDates, market.marketCode),
  ]);

  const parsedReport = readParsedReportByDate(parsedReportsByDate, reportDate);
  const caseState = readRequiredObject(JSON.parse(caseJsonRaw), 'Invalid case.json root object');
  const caseMarket = readRequiredString(caseState, 'market', 'Missing required case.json field market');

  if (caseMarket !== market.marketCode) {
    throw new Error(`case.json market mismatch: expected ${market.marketCode}, got ${caseMarket}`);
  }

  const trackedCaseIds = readRequiredStringArray(
    caseState,
    'tracked_case_ids',
    'Missing required case.json field tracked_case_ids',
    'Invalid case.json field tracked_case_ids',
  );
  const caseRecordsById = parseCaseRecordsById(caseState.cases, trackedCaseIds);
  const daySummaries = buildCaseReportDaySummaries(parsedReportsByDate, availableReportDates);
  const reportSectionsByDate = buildReportSectionsByDate(parsedReportsByDate, availableReportDates);

  return {
    ...parsedReport,
    marketSlug,
    marketLabel: market.label,
    caseRoot,
    reportPath,
    caseJsonPath,
    availableReportDates,
    reportSectionsByDate,
    daySummaries,
    trackedCaseIds,
    caseRecordsById,
    generatedAt: typeof caseState.generated_at === 'string' ? caseState.generated_at : null,
  };
}

export async function readCaseReportBundle(
  marketSlug: CaseReportMarketSlug,
  requestedReportDate?: string,
): Promise<CaseReportBundle> {
  const market = resolveMarketConfig(marketSlug);
  return readCaseReportBundleFromCaseRoot(market.caseRoot, marketSlug, requestedReportDate);
}
