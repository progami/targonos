import { getApiBaseUrl } from '../client';
import { getQboConnection, saveServerQboConnection } from '../connection-store';
import * as qboApi from '../api';
import type { QboConnection } from '../api';

export type CoverageRow = {
  transactionType: 'Purchase' | 'Bill' | 'Transfer' | 'JournalEntry' | 'BillPayment' | 'Invoice' | 'Attachable';
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

const retryableStatusCodes = new Set([429, 503]);
const retryMaxAttempts = 3;
const retryBaseDelayMs = 1000;
const queryTimeoutMs = 60000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = queryTimeoutMs): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await qboFullHistoryAuditDeps.fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= retryMaxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init);
      if (response.ok) {
        return response;
      }

      if (!retryableStatusCodes.has(response.status) || attempt === retryMaxAttempts) {
        return response;
      }
    } catch (error) {
      if (attempt === retryMaxAttempts) {
        throw error;
      }
    }

    await qboFullHistoryAuditDeps.sleep(retryBaseDelayMs * Math.pow(2, attempt));
  }

  throw new Error('fetchWithRetry: unreachable');
}

export const qboFullHistoryAuditDeps = {
  fetch: (url: string, init: RequestInit) => fetch(url, init),
  getQboConnection,
  getValidToken: qboApi.getValidToken,
  saveServerQboConnection,
  sleep,
};

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

export type ActiveQboConnection = {
  connection: QboConnection;
  accessToken: string;
};

async function qboQueryAllByCredentials<T extends Record<string, unknown>>(
  accessToken: string,
  realmId: string,
  baseUrl: string,
  buildQuery: (startPosition: number, maxResults: number) => string,
): Promise<{ rows: T[]; complete: boolean }> {
  const maxResults = 1000;
  let startPosition = 1;
  const rows: T[] = [];

  while (true) {
    const pageQuery = buildQuery(startPosition, maxResults);
    const response = await fetchWithRetry(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(pageQuery)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch QBO query page: ${response.status} ${errorText}`);
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

    rows.push(...(pageRows as T[]));

    if (pageRows.length < maxResults) {
      return { rows, complete: true };
    }

    startPosition += maxResults;
  }
}

export async function getActiveQboConnection(): Promise<ActiveQboConnection> {
  const connection = await qboFullHistoryAuditDeps.getQboConnection();
  if (connection === null) {
    throw new Error('No active QBO connection');
  }

  const { accessToken, updatedConnection } = await qboFullHistoryAuditDeps.getValidToken(connection);
  if (updatedConnection !== undefined) {
    await qboFullHistoryAuditDeps.saveServerQboConnection(updatedConnection);
  }

  return {
    connection: updatedConnection ?? connection,
    accessToken,
  };
}

export async function fetchAuditSourceData(accessToken: string, realmId: string, baseUrl: string) {
  const [purchases, bills, journalEntries, transfers, attachables] = await Promise.all([
    qboQueryAllByCredentials<any>(
      accessToken,
      realmId,
      baseUrl,
      (start, max) => `SELECT * FROM Purchase ORDERBY TxnDate STARTPOSITION ${start} MAXRESULTS ${max}`,
    ),
    qboQueryAllByCredentials<any>(
      accessToken,
      realmId,
      baseUrl,
      (start, max) => `SELECT * FROM Bill ORDERBY TxnDate STARTPOSITION ${start} MAXRESULTS ${max}`,
    ),
    qboQueryAllByCredentials<any>(
      accessToken,
      realmId,
      baseUrl,
      (start, max) => `SELECT * FROM JournalEntry ORDERBY TxnDate STARTPOSITION ${start} MAXRESULTS ${max}`,
    ),
    qboQueryAllByCredentials<any>(
      accessToken,
      realmId,
      baseUrl,
      (start, max) => `SELECT * FROM Transfer ORDERBY TxnDate STARTPOSITION ${start} MAXRESULTS ${max}`,
    ),
    qboQueryAllByCredentials<any>(
      accessToken,
      realmId,
      baseUrl,
      (start, max) => `SELECT * FROM Attachable STARTPOSITION ${start} MAXRESULTS ${max}`,
    ),
  ]);

  return { purchases, bills, journalEntries, transfers, attachables };
}

export async function qboQueryAll(
  activeConnection: ActiveQboConnection,
  query: string,
): Promise<{ rows: Record<string, unknown>[]; complete: boolean }> {
  return qboQueryAllByCredentials<Record<string, unknown>>(
    activeConnection.accessToken,
    activeConnection.connection.realmId,
    getApiBaseUrl(),
    (startPosition, maxResults) => `${query} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`,
  );
}
