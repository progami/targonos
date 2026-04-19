import { promises as fs } from 'node:fs';
import path from 'node:path';

const CASE_REPORT_HEADER =
  '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |';
const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

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

export type CaseReportActionKind =
  | 'monitor'
  | 'checkpoint'
  | 'collect_evidence'
  | 'send_email'
  | 'send_case_reply'
  | 'send_forum_post';

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
  primaryEmail: string;
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

function parseReportHeading(line: string): { reportDate: string; marketCode: string } {
  const match = /^## Case Report - (\d{4}-\d{2}-\d{2}) \(([A-Z]{2})\)$/u.exec(line.trim());
  if (match === null) {
    throw new Error(`Invalid case report heading: ${line}`);
  }
  return {
    reportDate: match[1],
    marketCode: match[2],
  };
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());
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

function parseCaseRecord(rawCaseId: string, value: unknown): CaseReportCaseRecord {
  const record = readRequiredObject(value, `Invalid case.json case record for case ${rawCaseId}`);
  const caseId = readRequiredString(
    record,
    'case_id',
    `Missing required case.json case field case_id for case ${rawCaseId}`,
  );

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
    primaryEmail: readRequiredString(
      record,
      'primary_email',
      `Missing required case.json case field primary_email for case ${rawCaseId}`,
    ),
    actionKind: readRequiredString(
      record,
      'action_kind',
      `Missing required case.json case field action_kind for case ${rawCaseId}`,
    ) as CaseReportActionKind,
    approvalRequired: readRequiredBoolean(
      record,
      'approval_required',
      `Missing required case.json case field approval_required for case ${rawCaseId}`,
    ),
  };
}

function parseCaseRecordsById(value: unknown): Record<string, CaseReportCaseRecord> {
  const cases = readRequiredObject(value, 'Missing required case.json cases map');

  return Object.fromEntries(
    Object.entries(cases).map(([caseId, caseRecord]) => [caseId, parseCaseRecord(caseId, caseRecord)]),
  );
}

export function parseCaseReportMarkdown(markdown: string): ParsedCaseReport {
  const lines = markdown.split(/\r?\n/u);
  const headingLine = lines.find((line) => line.startsWith('## Case Report - '));
  if (headingLine === undefined) {
    throw new Error('Case report heading not found.');
  }

  const { reportDate, marketCode } = parseReportHeading(headingLine);
  const sections: CaseReportSection[] = [];
  let currentSection: CaseReportSection | null = null;
  let readingTable = false;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (currentSection !== null) {
        sections.push(currentSection);
      }
      currentSection = {
        entity: line.replace(/^### /u, '').trim(),
        rows: [],
      };
      readingTable = false;
      continue;
    }

    if (currentSection === null) {
      continue;
    }

    if (line.startsWith(CASE_REPORT_HEADER)) {
      readingTable = true;
      continue;
    }

    if (readingTable && line.startsWith('|---')) {
      continue;
    }

    if (readingTable && line.trim().startsWith('|')) {
      const cells = parseTableCells(line);
      if (cells.length !== 8) {
        throw new Error(`Unexpected case report row: ${line}`);
      }
      currentSection.rows.push({
        category: cells[0],
        issue: cells[1],
        caseId: cells[2],
        daysAgo: cells[3],
        status: cells[4],
        evidence: cells[5],
        assessment: cells[6],
        nextStep: cells[7],
      });
      continue;
    }
  }

  if (currentSection !== null) {
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    throw new Error('Case report contains no entity sections.');
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
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => fileName.replace(/\.md$/u, ''))
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

async function readCaseReportDaySummaries(
  caseRoot: string,
  availableReportDates: string[],
  marketCode: string,
): Promise<CaseReportDaySummary[]> {
  return Promise.all(
    availableReportDates.map(async (reportDate) => {
      const reportPath = path.join(caseRoot, 'reports', `${reportDate}.md`);
      const markdown = await fs.readFile(reportPath, 'utf8');
      const parsedReport = parseCaseReportMarkdown(markdown);

      if (parsedReport.reportDate !== reportDate) {
        throw new Error(`Case report date mismatch: expected ${reportDate}, got ${parsedReport.reportDate}`);
      }

      if (parsedReport.marketCode !== marketCode) {
        throw new Error(`Case report market mismatch: expected ${marketCode}, got ${parsedReport.marketCode}`);
      }

      return countCaseReportRows(parsedReport);
    }),
  );
}

async function readReportSectionsByDate(
  caseRoot: string,
  availableReportDates: string[],
  marketCode: string,
): Promise<Record<string, CaseReportSection[]>> {
  const reports = await Promise.all(
    availableReportDates.map(async (reportDate) => {
      const reportPath = path.join(caseRoot, 'reports', `${reportDate}.md`);
      const markdown = await fs.readFile(reportPath, 'utf8');
      const parsedReport = parseCaseReportMarkdown(markdown);

      if (parsedReport.reportDate !== reportDate) {
        throw new Error(`Case report date mismatch: expected ${reportDate}, got ${parsedReport.reportDate}`);
      }

      if (parsedReport.marketCode !== marketCode) {
        throw new Error(`Case report market mismatch: expected ${marketCode}, got ${parsedReport.marketCode}`);
      }

      return [reportDate, parsedReport.sections] as const;
    }),
  );

  return Object.fromEntries(reports);
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

  const reportPath = path.join(caseRoot, 'reports', `${reportDate}.md`);
  const caseJsonPath = path.join(caseRoot, 'case.json');
  const [markdown, caseJsonRaw, daySummaries, reportSectionsByDate] = await Promise.all([
    fs.readFile(reportPath, 'utf8'),
    fs.readFile(caseJsonPath, 'utf8'),
    readCaseReportDaySummaries(caseRoot, availableReportDates, market.marketCode),
    readReportSectionsByDate(caseRoot, availableReportDates, market.marketCode),
  ]);

  const parsedReport = parseCaseReportMarkdown(markdown);
  if (parsedReport.marketCode !== market.marketCode) {
    throw new Error(
      `Case report market mismatch: expected ${market.marketCode}, got ${parsedReport.marketCode}`,
    );
  }

  const caseState = readRequiredObject(JSON.parse(caseJsonRaw), 'Invalid case.json root object');
  const caseMarket = readRequiredString(caseState, 'market', 'Missing required case.json field market');

  if (caseMarket !== market.marketCode) {
    throw new Error(`case.json market mismatch: expected ${market.marketCode}, got ${caseMarket}`);
  }

  const caseRecordsById = parseCaseRecordsById(caseState.cases);

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
    trackedCaseIds: Array.isArray(caseState.tracked_case_ids) ? caseState.tracked_case_ids : [],
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
