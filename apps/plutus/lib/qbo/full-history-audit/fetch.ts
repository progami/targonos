import { getApiBaseUrl } from '../client';
import { getQboConnection } from '../connection-store';
import type { QboConnection } from '../api';

export type CoverageRow = {
  transactionType: 'Purchase' | 'Bill' | 'Transfer' | 'JournalEntry' | 'BillPayment' | 'Invoice';
  scannedCount: number;
  complete: boolean;
};

export type RawAttachable = {
  Id: string;
  FileName?: string;
  AttachableRef?: Array<{ EntityRef?: { type?: string; value?: string } }>;
};

export type CoverageSummary = {
  completeCoverage: boolean;
  failedTypes: CoverageRow['transactionType'][];
  scannedCount: number;
};

function extractArrayKey(queryResponse: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(queryResponse)) {
    if (Array.isArray(value)) return key;
  }
  return null;
}

export function mergeAttachmentRefs(attachables: RawAttachable[]): Map<string, string[]> {
  const merged = new Map<string, string[]>();

  for (const attachable of attachables) {
    const fileName = attachable.FileName;
    if (fileName === undefined) continue;

    const refs = attachable.AttachableRef;
    if (refs === undefined) continue;

    for (const ref of refs) {
      const entityRef = ref.EntityRef;
      if (entityRef === undefined) continue;

      const entityType = entityRef.type;
      const entityId = entityRef.value;
      if (entityType === undefined || entityId === undefined) continue;

      const key = `${entityType}:${entityId}`;
      const existing = merged.get(key);
      if (existing === undefined) {
        merged.set(key, [fileName]);
        continue;
      }

      if (!existing.includes(fileName)) {
        existing.push(fileName);
      }
    }
  }

  return merged;
}

export function summarizeCoverage(rows: CoverageRow[]): CoverageSummary {
  let scannedCount = 0;
  const failedTypes: CoverageSummary['failedTypes'] = [];
  let completeCoverage = true;

  for (const row of rows) {
    scannedCount += row.scannedCount;
    if (row.complete) continue;

    completeCoverage = false;
    if (!failedTypes.includes(row.transactionType)) {
      failedTypes.push(row.transactionType);
    }
  }

  return {
    completeCoverage,
    failedTypes,
    scannedCount,
  };
}

export async function getActiveQboConnection(): Promise<QboConnection> {
  const connection = await getQboConnection();
  if (connection === null) {
    throw new Error('No active QBO connection');
  }
  return connection;
}

export async function qboQueryAll(
  connection: QboConnection,
  query: string,
): Promise<{ rows: Record<string, unknown>[]; complete: boolean }> {
  const baseUrl = getApiBaseUrl();
  const maxResults = 1000;
  let startPosition = 1;
  const rows: Record<string, unknown>[] = [];

  while (true) {
    const pageQuery = `${query} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const response = await fetch(`${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(pageQuery)}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return { rows, complete: false };
    }

    const data = (await response.json()) as { QueryResponse?: Record<string, unknown> };
    const queryResponse = data.QueryResponse;
    if (queryResponse === undefined) {
      return { rows, complete: true };
    }

    const arrayKey = extractArrayKey(queryResponse);
    if (arrayKey === null) {
      return { rows, complete: true };
    }

    const pageRows = queryResponse[arrayKey];
    if (!Array.isArray(pageRows)) {
      return { rows, complete: true };
    }

    rows.push(...pageRows);

    if (pageRows.length < maxResults) {
      return { rows, complete: true };
    }

    startPosition += maxResults;
  }
}
