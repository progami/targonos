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

export type CaseReportBundle = ParsedCaseReport & {
  marketSlug: CaseReportMarketSlug;
  marketLabel: string;
  caseRoot: string;
  reportPath: string;
  caseJsonPath: string;
  availableReportDates: string[];
  trackedCaseIds: string[];
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
  const [markdown, caseJsonRaw] = await Promise.all([
    fs.readFile(reportPath, 'utf8'),
    fs.readFile(caseJsonPath, 'utf8'),
  ]);

  const parsedReport = parseCaseReportMarkdown(markdown);
  if (parsedReport.marketCode !== market.marketCode) {
    throw new Error(
      `Case report market mismatch: expected ${market.marketCode}, got ${parsedReport.marketCode}`,
    );
  }

  const caseState = JSON.parse(caseJsonRaw) as {
    market: string;
    generated_at?: string;
    tracked_case_ids?: string[];
  };

  if (caseState.market !== market.marketCode) {
    throw new Error(`case.json market mismatch: expected ${market.marketCode}, got ${caseState.market}`);
  }

  return {
    ...parsedReport,
    marketSlug,
    marketLabel: market.label,
    caseRoot,
    reportPath,
    caseJsonPath,
    availableReportDates,
    trackedCaseIds: Array.isArray(caseState.tracked_case_ids) ? caseState.tracked_case_ids : [],
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
