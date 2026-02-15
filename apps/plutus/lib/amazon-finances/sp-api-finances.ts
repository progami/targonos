import type { TenantCode } from './types';
import type {
  SpApiFinancialEventGroup,
  SpApiFinancialEvents,
  SpApiListFinancialEventGroupsResponse,
  SpApiListFinancialEventsByGroupIdResponse,
  SpApiListTransactionsResponse,
  SpApiTransaction,
  SpApiTransactionRelatedIdentifier,
} from './types';

type CallAmazonApi = <T>(tenantCode: TenantCode | undefined, params: Record<string, unknown>) => Promise<T>;

let cachedCallAmazonApi: CallAmazonApi | null = null;

async function getCallAmazonApi(): Promise<CallAmazonApi> {
  if (cachedCallAmazonApi) return cachedCallAmazonApi;

  const mod = (await import('@targon/amazon-sp-api')) as { callAmazonApi: CallAmazonApi };
  cachedCallAmazonApi = mod.callAmazonApi;
  return cachedCallAmazonApi;
}

function getRelatedIdentifierValue(
  identifiers: SpApiTransactionRelatedIdentifier[] | undefined,
  name: string,
): string | null {
  const list = Array.isArray(identifiers) ? identifiers : [];
  const match = list.find((entry) => entry?.relatedIdentifierName === name);
  const value = match?.relatedIdentifierValue;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function mergeFinancialEvents(target: SpApiFinancialEvents, page: SpApiFinancialEvents): void {
  for (const [key, value] of Object.entries(page)) {
    if (!Array.isArray(value) || value.length === 0) continue;

    const existing = (target as Record<string, unknown>)[key];
    if (existing === undefined) {
      (target as Record<string, unknown>)[key] = value;
      continue;
    }

    if (!Array.isArray(existing)) {
      throw new Error(`Unexpected non-array FinancialEvents.${key}`);
    }

    (target as Record<string, unknown>)[key] = existing.concat(value);
  }
}

export async function listAllFinancialEventGroups(input: {
  tenantCode: TenantCode;
  startedAfterIso: string;
  startedBeforeIso: string;
  maxResultsPerPage?: number;
}): Promise<SpApiFinancialEventGroup[]> {
  const callAmazonApi = await getCallAmazonApi();

  const maxResultsPerPage = input.maxResultsPerPage === undefined ? 100 : input.maxResultsPerPage;
  const result: SpApiFinancialEventGroup[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 200; page++) {
    const res = await callAmazonApi<SpApiListFinancialEventGroupsResponse>(input.tenantCode, {
      operation: 'listFinancialEventGroups',
      endpoint: 'finances',
      options: { version: 'v0' },
      query: {
        FinancialEventGroupStartedAfter: input.startedAfterIso,
        FinancialEventGroupStartedBefore: input.startedBeforeIso,
        MaxResultsPerPage: maxResultsPerPage,
        NextToken: nextToken,
      },
    });

    const groups = Array.isArray(res.FinancialEventGroupList) ? res.FinancialEventGroupList : [];
    result.push(...groups);

    const token = res.NextToken;
    if (typeof token !== 'string' || token.trim() === '') break;
    nextToken = token;
  }

  return result;
}

export async function fetchAllFinancialEventsByGroupId(input: {
  tenantCode: TenantCode;
  eventGroupId: string;
  maxResultsPerPage?: number;
}): Promise<SpApiFinancialEvents> {
  const callAmazonApi = await getCallAmazonApi();

  const maxResultsPerPage = input.maxResultsPerPage === undefined ? 100 : input.maxResultsPerPage;
  const merged: SpApiFinancialEvents = {};

  let nextToken: string | undefined;
  for (let page = 0; page < 500; page++) {
    const res = await callAmazonApi<SpApiListFinancialEventsByGroupIdResponse>(input.tenantCode, {
      operation: 'listFinancialEventsByGroupId',
      endpoint: 'finances',
      options: { version: 'v0' },
      path: { eventGroupId: input.eventGroupId },
      query: {
        MaxResultsPerPage: maxResultsPerPage,
        NextToken: nextToken,
      },
    });

    const events = res.FinancialEvents;
    if (events) {
      mergeFinancialEvents(merged, events);
    }

    const token = res.NextToken;
    if (typeof token !== 'string' || token.trim() === '') break;
    nextToken = token;
  }

  return merged;
}

export async function findFinancialEventGroupIdForSettlementId(input: {
  tenantCode: TenantCode;
  settlementId: string;
  postedAfterIso: string;
  postedBeforeIso: string;
}): Promise<string> {
  const callAmazonApi = await getCallAmazonApi();

  const matches: Array<{ transaction: SpApiTransaction; groupId: string }> = [];

  let nextToken: string | undefined;
  for (let page = 0; page < 500; page++) {
    const res = await callAmazonApi<SpApiListTransactionsResponse>(input.tenantCode, {
      operation: 'listTransactions',
      endpoint: 'finances',
      options: { version: '2024-06-19' },
      query: {
        postedAfter: input.postedAfterIso,
        postedBefore: input.postedBeforeIso,
        nextToken,
      },
    });

    const txs = Array.isArray(res.transactions) ? res.transactions : [];
    for (const tx of txs) {
      const relatedSettlementId = getRelatedIdentifierValue(tx.relatedIdentifiers, 'SETTLEMENT_ID');
      if (relatedSettlementId !== input.settlementId) continue;

      const groupId = getRelatedIdentifierValue(tx.relatedIdentifiers, 'FINANCIAL_EVENT_GROUP_ID');
      if (!groupId) continue;

      matches.push({ transaction: tx, groupId });
    }

    const token = res.nextToken;
    if (typeof token !== 'string' || token.trim() === '') break;
    nextToken = token;
  }

  if (matches.length === 0) {
    throw new Error(`No SP-API transactions found for settlementId ${input.settlementId}`);
  }

  const unique = new Set(matches.map((m) => m.groupId));
  if (unique.size !== 1) {
    throw new Error(`SettlementId ${input.settlementId} maps to multiple event groups: ${Array.from(unique).join(', ')}`);
  }

  const groupId = matches[0]!.groupId;
  return groupId;
}
