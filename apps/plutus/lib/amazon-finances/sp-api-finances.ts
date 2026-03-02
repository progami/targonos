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

type InboundShipmentItemsResponse = {
  payload?: {
    ItemData?: unknown[];
    items?: unknown[];
    shipmentItems?: unknown[];
  };
  ItemData?: unknown[];
  items?: unknown[];
  shipmentItems?: unknown[];
  errors?: Array<{
    code?: string;
    message?: string;
    details?: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed;
}

function readItemArray(source: Record<string, unknown>): Record<string, unknown>[] {
  const preferredKeys = ['ItemData', 'items', 'shipmentItems'];
  for (const key of preferredKeys) {
    const rows = asRecordArray(source[key]);
    if (rows.length > 0) return rows;
  }
  return [];
}

export function getRelatedIdentifierValue(
  identifiers: SpApiTransactionRelatedIdentifier[] | undefined,
  name: string,
): string | null {
  const list = Array.isArray(identifiers) ? identifiers : [];
  const upperName = name.trim().toUpperCase();

  for (const entry of list) {
    const rawName = entry?.relatedIdentifierName;
    if (typeof rawName !== 'string') continue;
    if (rawName.trim().toUpperCase() !== upperName) continue;

    const value = entry.relatedIdentifierValue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed === '') continue;
    return trimmed;
  }

  return null;
}

function mergeFinancialEvents(target: SpApiFinancialEvents, page: SpApiFinancialEvents): void {
  for (const [key, value] of Object.entries(page)) {
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) {
      throw new Error(`Unexpected non-array FinancialEvents.${key}`);
    }
    if (value.length === 0) continue;

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
  const seenTokens = new Set<string>();

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
    if (seenTokens.has(token)) {
      throw new Error(`SP-API listFinancialEventGroups returned repeated NextToken on page ${page + 1}`);
    }
    seenTokens.add(token);
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
  const seenTokens = new Set<string>();
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
    if (seenTokens.has(token)) {
      throw new Error(`SP-API listFinancialEventsByGroupId returned repeated NextToken for group ${input.eventGroupId}`);
    }
    seenTokens.add(token);
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

  let matchedGroupId: string | null = null;

  let nextToken: string | undefined;
  const seenTokens = new Set<string>();
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

      if (matchedGroupId === null) {
        matchedGroupId = groupId;
        // Settlement ID uniquely identifies a single financial event group.
        // Once resolved, stop paginating to avoid scanning unrelated transactions.
        return matchedGroupId;
      }

      if (matchedGroupId !== groupId) {
        throw new Error(`SettlementId ${input.settlementId} maps to multiple event groups: ${matchedGroupId}, ${groupId}`);
      }
    }

    const token = res.nextToken;
    if (typeof token !== 'string' || token.trim() === '') break;
    if (seenTokens.has(token)) {
      throw new Error(`SP-API listTransactions returned repeated nextToken while resolving settlement ${input.settlementId}`);
    }
    seenTokens.add(token);
    nextToken = token;
  }

  if (matchedGroupId === null) {
    throw new Error(`No SP-API transactions found for settlementId ${input.settlementId}`);
  }

  return matchedGroupId;
}

export async function listSettlementEventGroupsFromTransactions(input: {
  tenantCode: TenantCode;
  postedAfterIso: string;
  postedBeforeIso: string;
}): Promise<Map<string, string>> {
  const callAmazonApi = await getCallAmazonApi();

  const settlementToGroupId = new Map<string, string>();

  let nextToken: string | undefined;
  const seenTokens = new Set<string>();
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
      const settlementId = getRelatedIdentifierValue(tx.relatedIdentifiers, 'SETTLEMENT_ID');
      if (!settlementId) continue;

      const groupId = getRelatedIdentifierValue(tx.relatedIdentifiers, 'FINANCIAL_EVENT_GROUP_ID');
      if (!groupId) continue;

      const existing = settlementToGroupId.get(settlementId);
      if (existing !== undefined && existing !== groupId) {
        throw new Error(`SettlementId ${settlementId} maps to multiple event groups: ${existing}, ${groupId}`);
      }

      settlementToGroupId.set(settlementId, groupId);
    }

    const token = res.nextToken;
    if (typeof token !== 'string' || token.trim() === '') break;
    if (seenTokens.has(token)) {
      throw new Error('SP-API listTransactions returned repeated nextToken while listing settlement groups');
    }
    seenTokens.add(token);
    nextToken = token;
  }

  return settlementToGroupId;
}

export async function listTransactionsForSettlementId(input: {
  tenantCode: TenantCode;
  settlementId: string;
  postedAfterIso: string;
  postedBeforeIso: string;
}): Promise<SpApiTransaction[]> {
  const callAmazonApi = await getCallAmazonApi();

  const matchedTransactions: SpApiTransaction[] = [];

  let nextToken: string | undefined;
  const seenTokens = new Set<string>();
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
      const settlementId = getRelatedIdentifierValue(tx.relatedIdentifiers, 'SETTLEMENT_ID');
      if (settlementId !== input.settlementId) continue;
      matchedTransactions.push(tx);
    }

    const token = res.nextToken;
    if (typeof token !== 'string' || token.trim() === '') break;
    if (seenTokens.has(token)) {
      throw new Error(
        `SP-API listTransactions returned repeated nextToken while loading settlement transactions ${input.settlementId}`,
      );
    }
    seenTokens.add(token);
    nextToken = token;
  }

  return matchedTransactions;
}

export async function fetchInboundShipmentItemsByShipmentId(input: {
  tenantCode: TenantCode;
  shipmentId: string;
}): Promise<Array<{ sellerSku: string; quantityShipped: number }>> {
  const callAmazonApi = await getCallAmazonApi();

  const shipmentId = input.shipmentId.trim();
  if (shipmentId === '') {
    throw new Error('Missing shipmentId');
  }

  const res = await callAmazonApi<InboundShipmentItemsResponse>(input.tenantCode, {
    operation: 'getShipmentItemsByShipmentId',
    endpoint: 'fulfillmentInbound',
    path: { shipmentId },
  });

  const errorList = Array.isArray(res.errors) ? res.errors : [];
  if (errorList.length > 0) {
    const details = errorList
      .map((entry) => {
        const message = readTrimmedString(entry.message);
        if (message !== null) return message;
        const code = readTrimmedString(entry.code);
        if (code !== null) return code;
        return 'Unknown SP-API error';
      })
      .join(' | ');
    throw new Error(`SP-API getShipmentItemsByShipmentId failed for ${shipmentId}: ${details}`);
  }

  const responseRecord = asRecord(res);
  if (responseRecord === null) {
    throw new Error(`Invalid shipment item response shape for ${shipmentId}`);
  }

  const payloadValue = responseRecord.payload;
  const payloadRecord = asRecord(payloadValue);

  let itemRecords: Record<string, unknown>[] = [];
  if (payloadRecord !== null) {
    itemRecords = readItemArray(payloadRecord);
  }
  if (itemRecords.length === 0) {
    itemRecords = readItemArray(responseRecord);
  }

  const result: Array<{ sellerSku: string; quantityShipped: number }> = [];
  for (const row of itemRecords) {
    const sellerSku = readTrimmedString(row.SellerSKU);
    if (sellerSku === null) continue;

    const quantityRaw = row.QuantityShipped;
    if (typeof quantityRaw !== 'number' || !Number.isFinite(quantityRaw)) {
      throw new Error(`Invalid QuantityShipped for shipment ${shipmentId} SKU ${sellerSku}`);
    }
    if (!Number.isInteger(quantityRaw) || quantityRaw <= 0) {
      throw new Error(`Non-positive QuantityShipped for shipment ${shipmentId} SKU ${sellerSku}: ${quantityRaw}`);
    }

    result.push({
      sellerSku,
      quantityShipped: quantityRaw,
    });
  }

  return result;
}
