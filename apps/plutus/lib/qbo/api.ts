import { getApiBaseUrl, refreshAccessToken } from './client';
import { createLogger } from '@targon/logger';
import { getCached, setCache, invalidateCache } from './cache';
import { loadServerQboConnection, saveServerQboConnection } from './connection-store';

const logger = createLogger({ name: 'qbo-api' });

// Default timeout for QBO API calls (60 seconds)
const QBO_TIMEOUT_MS = 60000;

/**
 * Escape a string for safe interpolation into a SOQL LIKE query.
 * Escapes single quotes, backslashes, and percent signs.
 */
function escapeSoql(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

export class QboAuthError extends Error {
  name = 'QboAuthError';
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = QBO_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

/**
 * Fetch with retry logic and exponential backoff.
 * Retries on HTTP 429, 503, and network errors.
 * Does NOT retry on 401/403 (auth) or 400 (client) errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number = QBO_TIMEOUT_MS,
): Promise<Response> {
  for (let attempt = 0; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      if (response.ok) {
        return response;
      }

      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      if (attempt < RETRY_MAX_ATTEMPTS) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn('Retryable HTTP error from QBO, retrying', {
          status: response.status,
          attempt: attempt + 1,
          maxAttempts: RETRY_MAX_ATTEMPTS,
          delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < RETRY_MAX_ATTEMPTS) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn('Network error from QBO, retrying', {
          error: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
          maxAttempts: RETRY_MAX_ATTEMPTS,
          delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry: exceeded max retries');
}

export interface QboConnection {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface QboPurchase {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  TotalAmt: number;
  PaymentType: 'Cash' | 'Check' | 'CreditCard';
  DocNumber?: string;
  PrivateNote?: string;
  EntityRef?: {
    value: string;
    name: string;
  };
  AccountRef?: {
    value: string;
    name: string;
  };
  Line?: Array<{
    Id: string;
    Amount: number;
    Description?: string;
    AccountBasedExpenseLineDetail?: {
      AccountRef: {
        value: string;
        name: string;
      };
    };
    ItemBasedExpenseLineDetail?: {
      ItemRef?: { value: string; name: string };
      AccountRef?: { value: string; name: string };
    };
  }>;
  MetaData?: {
    CreateTime: string;
    LastUpdatedTime: string;
  };
}

export interface QboBill {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  TotalAmt: number;
  DocNumber?: string;
  DueDate?: string;
  PrivateNote?: string;
  ExchangeRate?: number;
  CurrencyRef?: {
    value: string;
    name?: string;
  };
  SalesTermRef?: {
    value: string;
    name?: string;
  };
  CustomField?: Array<{
    DefinitionId?: string;
    Name?: string;
    Type?: string;
    StringValue?: string;
  }>;
  VendorRef?: {
    value: string;
    name: string;
  };
  Line?: Array<{
    Id: string;
    Amount: number;
    Description?: string;
    AccountBasedExpenseLineDetail?: {
      AccountRef: {
        value: string;
        name: string;
      };
      ClassRef?: {
        value: string;
        name?: string;
      };
      CustomerRef?: {
        value: string;
        name?: string;
      };
      TaxCodeRef?: {
        value: string;
        name?: string;
      };
    };
    ItemBasedExpenseLineDetail?: {
      ItemRef?: { value: string; name: string };
      AccountRef?: { value: string; name: string };
    };
  }>;
  MetaData?: {
    CreateTime: string;
    LastUpdatedTime: string;
  };
}

export interface QboAccount {
  Id: string;
  SyncToken: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  FullyQualifiedName?: string;
  AcctNum?: string;
  Active?: boolean;
  CurrentBalance?: number;
  CurrentBalanceWithSubAccounts?: number;
  CurrencyRef?: {
    value: string;
    name?: string;
  };
  Classification?: string;
  SubAccount?: boolean;
  ParentRef?: {
    value: string;
    name?: string;
  };
}

export interface QboJournalEntryLine {
  Id?: string;
  Amount?: number;
  Description?: string;
  DetailType: 'JournalEntryLineDetail';
  JournalEntryLineDetail: {
    PostingType: 'Debit' | 'Credit';
    AccountRef: {
      value: string;
      name?: string;
    };
  };
}

export interface QboJournalEntry {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  DocNumber?: string;
  PrivateNote?: string;
  Line: QboJournalEntryLine[];
  MetaData?: {
    CreateTime: string;
    LastUpdatedTime: string;
  };
}

export async function fetchJournalEntries(
  connection: QboConnection,
  params: {
    startDate?: string;
    endDate?: string;
    maxResults?: number;
    startPosition?: number;
    docNumberContains?: string;
  } = {},
): Promise<{ journalEntries: QboJournalEntry[]; totalCount: number; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const maxResults = params.maxResults === undefined ? 50 : params.maxResults;
  const startPosition = params.startPosition === undefined ? 1 : params.startPosition;

  const conditions: string[] = [];
  if (params.startDate) {
    conditions.push(`TxnDate >= '${escapeSoql(params.startDate)}'`);
  }
  if (params.endDate) {
    conditions.push(`TxnDate <= '${escapeSoql(params.endDate)}'`);
  }
  if (params.docNumberContains) {
    conditions.push(`DocNumber LIKE '%${escapeSoql(params.docNumberContains)}%'`);
  }

  let query = `SELECT * FROM JournalEntry`;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDERBY TxnDate DESC`;
  query += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching journal entries from QBO', { query });

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch journal entries', { status: response.status, error: errorText });
    throw new Error(`Failed to fetch journal entries: ${response.status} ${errorText}`);
  }

  const data: QboQueryResponse = await response.json();
  const journalEntries = data.QueryResponse.JournalEntry;
  if (!journalEntries) {
    return { journalEntries: [], totalCount: 0, updatedConnection };
  }

  let totalCount = journalEntries.length;
  if (journalEntries.length > 0) {
    const countQuery = `SELECT COUNT(*) FROM JournalEntry${conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''}`;
    const countUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(countQuery)}`;

    try {
      const countResponse = await fetchWithRetry(
        countUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
        30000,
      );

      if (countResponse.ok) {
        const countData = await countResponse.json();
        if (countData.QueryResponse?.totalCount !== undefined) {
          totalCount = countData.QueryResponse.totalCount;
        }
      } else {
        logger.warn('Journal entry count query failed', { status: countResponse.status });
      }
    } catch (err) {
      logger.warn('Journal entry count query error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { journalEntries, totalCount, updatedConnection };
}

export async function createJournalEntry(
  connection: QboConnection,
  input: {
    txnDate: string;
    docNumber?: string;
    privateNote?: string;
    lines: Array<{
      amount: number;
      postingType: 'Debit' | 'Credit';
      accountId: string;
      description?: string;
    }>;
  },
): Promise<{ journalEntry: QboJournalEntry; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/journalentry`;

  const payload = {
    TxnDate: input.txnDate,
    DocNumber: input.docNumber,
    PrivateNote: input.privateNote,
    Line: input.lines.map((line) => ({
      DetailType: 'JournalEntryLineDetail',
      Amount: line.amount,
      Description: line.description,
      JournalEntryLineDetail: {
        PostingType: line.postingType,
        AccountRef: {
          value: line.accountId,
        },
      },
    })),
  };

  logger.info('Creating journal entry in QBO', { txnDate: input.txnDate, docNumber: input.docNumber });

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to create journal entry', { status: response.status, error: errorText });
    throw new Error(`Failed to create journal entry: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { JournalEntry: QboJournalEntry };
  return { journalEntry: data.JournalEntry, updatedConnection };
}

export interface QboVendor {
  Id: string;
  DisplayName: string;
  Active?: boolean;
  CurrencyRef?: {
    value: string;
    name?: string;
  };
  BillAddr?: {
    Line1?: string;
    Line2?: string;
    Line3?: string;
    Line4?: string;
    Line5?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
  };
}

export interface QboTerm {
  Id: string;
  Name: string;
  Active?: boolean;
  Type?: string;
  DueDays?: number;
}

export interface QboCurrency {
  Id: string;
  Name?: string;
  Code?: string;
  Active?: boolean;
}

export interface QboPreferences {
  AccountingInfoPrefs?: {
    ClassTrackingPerTxnLine?: boolean;
    ClassTrackingPerTxn?: boolean;
    TrackDepartments?: boolean;
  };
  CurrencyPrefs?: {
    HomeCurrency?: {
      value: string;
      name?: string;
    };
    MultiCurrencyEnabled?: boolean;
  };
  VendorAndPurchasePrefs?: {
    POCustomField?: {
      Name?: string;
      Type?: string;
      DefinitionId?: string;
      CustomField?: Array<{
        Name?: string;
        Type?: string;
        DefinitionId?: string;
      }>;
    };
  };
}

export interface QboQueryResponse {
  QueryResponse: {
    Purchase?: QboPurchase[];
    Bill?: QboBill[];
    Account?: QboAccount[];
    JournalEntry?: QboJournalEntry[];
    Vendor?: QboVendor[];
    Term?: QboTerm[];
    Currency?: QboCurrency[];
    totalCount?: number;
    startPosition?: number;
    maxResults?: number;
  };
}


export interface FetchPurchasesOptions {
  startDate?: string;
  endDate?: string;
  docNumberContains?: string;
  maxResults?: number;
  startPosition?: number;
}

export interface FetchBillsOptions {
  startDate?: string;
  endDate?: string;
  docNumberContains?: string;
  maxResults?: number;
  startPosition?: number;
}

const tokenRefreshPromisesByRealmId = new Map<string, Promise<QboConnection>>();

async function refreshConnectionSingleFlight(connection: QboConnection): Promise<QboConnection> {
  const existing = tokenRefreshPromisesByRealmId.get(connection.realmId);
  if (existing) return existing;

  const refreshPromise = (async () => {
    const storedConnection = await loadServerQboConnection();
    if (storedConnection && storedConnection.realmId === connection.realmId) {
      const storedExpiresAt = new Date(storedConnection.expiresAt);
      const now = new Date();
      // Another request/process may have already refreshed and persisted the rotated refresh token.
      if (storedExpiresAt.getTime() - now.getTime() >= 5 * 60 * 1000) {
        return storedConnection;
      }
      connection = storedConnection;
    }

    const newTokens = await refreshAccessToken(connection.refreshToken);
    const updatedConnection: QboConnection = {
      ...connection,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: new Date(Date.now() + newTokens.expiresIn * 1000).toISOString(),
    };

    // Refresh tokens are rotated on each refresh; persist immediately so we don't lose the new refresh token
    // if a request fails before its caller writes the updated connection.
    await saveServerQboConnection(updatedConnection);

    return updatedConnection;
  })().finally(() => {
    tokenRefreshPromisesByRealmId.delete(connection.realmId);
  });

  tokenRefreshPromisesByRealmId.set(connection.realmId, refreshPromise);
  return refreshPromise;
}

/**
 * Ensure we have a valid access token, refreshing if needed
 */
export async function getValidToken(
  connection: QboConnection,
): Promise<{ accessToken: string; updatedConnection?: QboConnection }> {
  const expiresAt = new Date(connection.expiresAt);
  const now = new Date();

  // If token expires in less than 5 minutes, refresh it
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    logger.info('Access token expired or expiring soon, refreshing...');
    try {
      const updatedConnection = await refreshConnectionSingleFlight(connection);
      return { accessToken: updatedConnection.accessToken, updatedConnection };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('QBO token refresh failed', { realmId: connection.realmId, error: message });
      throw new QboAuthError('Session expired. Please reconnect to QuickBooks.');
    }
  }

  return { accessToken: connection.accessToken };
}

/**
 * Fetch Purchase transactions from QBO
 */
export async function fetchPurchases(
  connection: QboConnection,
  options: FetchPurchasesOptions = {},
): Promise<{ purchases: QboPurchase[]; totalCount: number; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const { startDate, endDate, docNumberContains, maxResults = 100, startPosition = 1 } = options;

  // Build query
  let query = `SELECT * FROM Purchase`;
  const conditions: string[] = [];

  if (startDate) {
    conditions.push(`TxnDate >= '${escapeSoql(startDate)}'`);
  }
  if (endDate) {
    conditions.push(`TxnDate <= '${escapeSoql(endDate)}'`);
  }
  if (docNumberContains) {
    conditions.push(`DocNumber LIKE '%${escapeSoql(docNumberContains)}%'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDERBY TxnDate DESC`;
  query += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching purchases from QBO', { query });

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch purchases', {
      status: response.status,
      error: errorText,
    });
    throw new Error(`Failed to fetch purchases: ${response.status} ${errorText}`);
  }

  const data: QboQueryResponse = await response.json();
  const purchases = data.QueryResponse?.Purchase;
  if (!purchases) {
    return { purchases: [], totalCount: 0, updatedConnection };
  }

  // Get total count with a separate query if we have results
  let totalCount = purchases.length;
  if (purchases.length > 0) {
    const countQuery = `SELECT COUNT(*) FROM Purchase${conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''}`;
    const countUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(countQuery)}`;

    try {
      const countResponse = await fetchWithRetry(
        countUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
        30000,
      );
      if (countResponse.ok) {
        const countData = await countResponse.json();
        if (countData.QueryResponse?.totalCount !== undefined) {
          totalCount = countData.QueryResponse.totalCount;
        }
      } else {
        logger.warn('Purchase count query failed', { status: countResponse.status });
      }
    } catch (err) {
      logger.warn('Purchase count query error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { purchases, totalCount, updatedConnection };
}

export async function fetchBills(
  connection: QboConnection,
  options: FetchBillsOptions = {},
): Promise<{ bills: QboBill[]; totalCount: number; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const { startDate, endDate, docNumberContains, maxResults = 100, startPosition = 1 } = options;

  let query = `SELECT * FROM Bill`;
  const conditions: string[] = [];

  if (startDate) {
    conditions.push(`TxnDate >= '${escapeSoql(startDate)}'`);
  }
  if (endDate) {
    conditions.push(`TxnDate <= '${escapeSoql(endDate)}'`);
  }
  if (docNumberContains) {
    conditions.push(`DocNumber LIKE '%${escapeSoql(docNumberContains)}%'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDERBY TxnDate DESC`;
  query += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching bills from QBO', { query });

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch bills', {
      status: response.status,
      error: errorText,
    });
    throw new Error(`Failed to fetch bills: ${response.status} ${errorText}`);
  }

  const data: QboQueryResponse = await response.json();
  const bills = data.QueryResponse?.Bill;
  if (!bills) {
    return { bills: [], totalCount: 0, updatedConnection };
  }

  let totalCount = bills.length;
  if (bills.length > 0) {
    const countQuery = `SELECT COUNT(*) FROM Bill${conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''}`;
    const countUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(countQuery)}`;

    try {
      const countResponse = await fetchWithRetry(
        countUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
        30000,
      );
      if (countResponse.ok) {
        const countData = await countResponse.json();
        if (countData.QueryResponse?.totalCount !== undefined) {
          totalCount = countData.QueryResponse.totalCount;
        }
      } else {
        logger.warn('Bill count query failed', { status: countResponse.status });
      }
    } catch (err) {
      logger.warn('Bill count query error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { bills, totalCount, updatedConnection };
}

/**
 * Fetch a single Bill by ID
 */
export async function fetchBillById(
  connection: QboConnection,
  billId: string,
): Promise<{ bill: QboBill; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/bill/${billId}`;

  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch bill', { billId, status: response.status, error: errorText });
    throw new Error(`Failed to fetch bill: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Bill: QboBill };
  return { bill: data.Bill, updatedConnection };
}

/**
 * Update a Bill's line item account references.
 */
export async function updateBillLineAccounts(
  connection: QboConnection,
  billId: string,
  syncToken: string,
  lineUpdates: Array<{ lineId: string; accountId: string; accountName: string }>,
): Promise<{ bill: QboBill; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const fetchUrl = `${baseUrl}/v3/company/${connection.realmId}/bill/${billId}`;
  const fetchResponse = await fetchWithRetry(fetchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!fetchResponse.ok) {
    const errorText = await fetchResponse.text();
    logger.error('Failed to fetch bill for update', { billId, status: fetchResponse.status, error: errorText });
    throw new Error(`Failed to fetch bill for update: ${fetchResponse.status} ${errorText}`);
  }

  const fetchData = (await fetchResponse.json()) as { Bill: QboBill };
  const bill = fetchData.Bill;

  const updateMap = new Map(lineUpdates.map((u) => [u.lineId, u]));
  const updatedLines = (bill.Line ?? []).map((line) => {
    const update = updateMap.get(line.Id);
    if (update && line.AccountBasedExpenseLineDetail) {
      return {
        ...line,
        AccountBasedExpenseLineDetail: {
          ...line.AccountBasedExpenseLineDetail,
          AccountRef: {
            value: update.accountId,
            name: update.accountName,
          },
        },
      };
    }
    return line;
  });

  const updateUrl = `${baseUrl}/v3/company/${connection.realmId}/bill?operation=update`;
  const payload = {
    ...bill,
    SyncToken: syncToken,
    Line: updatedLines,
  };

  logger.info('Updating bill line accounts in QBO', { billId, lineUpdates });

  const response = await fetchWithRetry(updateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to update bill', { billId, status: response.status, error: errorText });
    throw new Error(`Failed to update bill: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Bill: QboBill };
  return { bill: data.Bill, updatedConnection };
}

/**
 * Update a Bill's memo (PrivateNote) and line descriptions.
 * Fetches the current bill, applies updates, and sends a full update to QBO.
 */
export async function updateBill(
  connection: QboConnection,
  billId: string,
  updates: {
    privateNote?: string;
    lineDescriptions?: Array<{ lineId: string; description: string }>;
  },
): Promise<{ bill: QboBill; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const fetchUrl = `${baseUrl}/v3/company/${connection.realmId}/bill/${billId}`;
  const fetchResponse = await fetchWithRetry(fetchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!fetchResponse.ok) {
    const errorText = await fetchResponse.text();
    logger.error('Failed to fetch bill for update', { billId, status: fetchResponse.status, error: errorText });
    throw new Error(`Failed to fetch bill for update: ${fetchResponse.status} ${errorText}`);
  }

  const fetchData = (await fetchResponse.json()) as { Bill: QboBill };
  const bill = fetchData.Bill;

  const descMap = new Map(
    (updates.lineDescriptions ?? []).map((u) => [u.lineId, u.description]),
  );

  const updatedLines = (bill.Line ?? []).map((line) => {
    const newDesc = descMap.get(line.Id);
    if (newDesc !== undefined) {
      return { ...line, Description: newDesc };
    }
    return line;
  });

  const payload = {
    ...bill,
    Line: updatedLines,
    PrivateNote: updates.privateNote !== undefined ? updates.privateNote : bill.PrivateNote,
  };

  logger.info('Updating bill in QBO', { billId, updates });

  const updateUrl = `${baseUrl}/v3/company/${connection.realmId}/bill?operation=update`;
  const response = await fetchWithRetry(updateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to update bill', { billId, status: response.status, error: errorText });
    throw new Error(`Failed to update bill: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Bill: QboBill };
  return { bill: data.Bill, updatedConnection };
}

export async function updateBillWithPayload(
  connection: QboConnection,
  payload: Record<string, unknown>,
): Promise<{ bill: QboBill; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const updateUrl = `${baseUrl}/v3/company/${connection.realmId}/bill?operation=update`;
  const response = await fetchWithRetry(updateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to update bill with payload', { status: response.status, error: errorText });
    throw new Error(`Failed to update bill with payload: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Bill: QboBill };
  return { bill: data.Bill, updatedConnection };
}

/**
 * Fetch a single JournalEntry by ID
 */
export async function fetchJournalEntryById(
  connection: QboConnection,
  journalEntryId: string,
): Promise<{ journalEntry: QboJournalEntry; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/journalentry/${journalEntryId}`;

  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch journal entry', {
      journalEntryId,
      status: response.status,
      error: errorText,
    });
    throw new Error(`Failed to fetch journal entry: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { JournalEntry: QboJournalEntry };
  return { journalEntry: data.JournalEntry, updatedConnection };
}

/**
 * Fetch a single Purchase by ID
 */
export async function fetchPurchaseById(
  connection: QboConnection,
  purchaseId: string,
): Promise<{ purchase: QboPurchase; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/purchase/${purchaseId}`;

  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch purchase', {
      purchaseId,
      status: response.status,
      error: errorText,
    });
    throw new Error(`Failed to fetch purchase: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return { purchase: data.Purchase, updatedConnection };
}

/**
 * Update a Purchase transaction (sparse update for DocNumber and PrivateNote)
 */
export async function updatePurchase(
  connection: QboConnection,
  purchaseId: string,
  syncToken: string,
  paymentType: string,
  updates: { docNumber?: string; privateNote?: string },
): Promise<{ purchase: QboPurchase; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/purchase?operation=update`;

  const payload: Record<string, unknown> = {
    Id: purchaseId,
    SyncToken: syncToken,
    sparse: true,
    PaymentType: paymentType,
  };

  if (updates.docNumber !== undefined) {
    payload.DocNumber = updates.docNumber;
  }
  if (updates.privateNote !== undefined) {
    payload.PrivateNote = updates.privateNote;
  }

  logger.info('Updating purchase in QBO', { purchaseId, updates });

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to update purchase', { purchaseId, status: response.status, error: errorText });
    throw new Error(`Failed to update purchase: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return { purchase: data.Purchase, updatedConnection };
}

export async function updatePurchaseWithPayload(
  connection: QboConnection,
  payload: Record<string, unknown>,
): Promise<{ purchase: QboPurchase; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/purchase?operation=update`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to update purchase with payload', { status: response.status, error: errorText });
    throw new Error(`Failed to update purchase with payload: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Purchase: QboPurchase };
  return { purchase: data.Purchase, updatedConnection };
}

const ACCOUNTS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch Chart of Accounts from QBO
 */
export async function fetchAccounts(
  connection: QboConnection,
  options?: {
    includeInactive?: boolean;
  },
): Promise<{ accounts: QboAccount[]; updatedConnection?: QboConnection }> {
  const includeInactive = options?.includeInactive === true;
  const cacheKey = `accounts:${connection.realmId}:${includeInactive ? 'all' : 'active'}`;

  const cached = getCached<QboAccount[]>(cacheKey);
  if (cached) {
    logger.info('Returning cached accounts', { realmId: connection.realmId, includeInactive, count: cached.length });
    return { accounts: cached };
  }

  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const query = includeInactive
    ? `SELECT * FROM Account MAXRESULTS 1000`
    : `SELECT * FROM Account WHERE Active = true MAXRESULTS 1000`;
  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching accounts from QBO', { includeInactive });

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch accounts', { status: response.status, error: errorText });
    throw new Error(`Failed to fetch accounts: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as QboQueryResponse;
  const accounts = data.QueryResponse.Account;
  const result = accounts ? accounts : [];

  setCache(cacheKey, result, ACCOUNTS_CACHE_TTL_MS);

  return { accounts: result, updatedConnection };
}

export async function fetchAccountsByFullyQualifiedName(
  connection: QboConnection,
  fullyQualifiedName: string,
): Promise<{ accounts: QboAccount[]; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const query = `SELECT * FROM Account WHERE FullyQualifiedName = '${escapeSoql(fullyQualifiedName)}' MAXRESULTS 10`;
  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching account by fully qualified name from QBO', { fullyQualifiedName });

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch account', { status: response.status, error: errorText });
    throw new Error(`Failed to fetch account: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as QboQueryResponse;
  const accounts = data.QueryResponse.Account;
  return { accounts: accounts ? accounts : [], updatedConnection };
}

export async function createAccount(
  connection: QboConnection,
  input: {
    name: string;
    accountType: string;
    accountSubType?: string;
    parentId?: string;
  },
): Promise<{ account: QboAccount; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/account`;
  const payload: Record<string, unknown> = {
    Name: input.name,
    AccountType: input.accountType,
  };
  if (input.accountSubType) {
    payload.AccountSubType = input.accountSubType;
  }
  if (input.parentId) {
    payload.SubAccount = true;
    payload.ParentRef = { value: input.parentId };
  }

  logger.info('Creating account in QBO', { name: input.name, accountType: input.accountType, parentId: input.parentId });

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to create account', { status: response.status, error: errorText, name: input.name });
    throw new Error(`Failed to create account: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Account: QboAccount };

  // Invalidate accounts cache so next fetch picks up the new account
  invalidateCache(`accounts:${connection.realmId}`);

  return { account: data.Account, updatedConnection };
}

export async function updateAccountActive(
  connection: QboConnection,
  accountId: string,
  syncToken: string,
  name: string,
  active: boolean,
): Promise<{ account: QboAccount; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/account?operation=update`;
  const payload = {
    sparse: true,
    Id: accountId,
    SyncToken: syncToken,
    Name: name,
    Active: active,
  };

  logger.info('Updating account in QBO', { accountId, active });

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to update account', { accountId, status: response.status, error: errorText });
    throw new Error(`Failed to update account: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return { account: data.Account, updatedConnection };
}

/**
 * Create a Bill in QBO.
 */
export async function createBill(
  connection: QboConnection,
  input: {
    txnDate: string;
    vendorId: string;
    dueDate?: string;
    docNumber?: string;
    salesTermId?: string;
    currencyCode?: string;
    exchangeRate?: number;
    departmentId?: string;
    privateNote?: string;
    customFields?: Array<{
      definitionId?: string;
      name?: string;
      type: 'StringType' | 'NumberType' | 'BooleanType';
      value: string | number | boolean;
    }>;
    lines: Array<{
      amount: number;
      accountId: string;
      description?: string;
      classId?: string;
      customerId?: string;
      taxCodeId?: string;
    }>;
  },
): Promise<{ bill: QboBill; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/bill`;

  const payload: Record<string, unknown> = {
    TxnDate: input.txnDate,
    VendorRef: { value: input.vendorId },
    Line: input.lines.map((line) => ({
      ...(() => {
        const detail: Record<string, unknown> = {
          AccountRef: { value: line.accountId },
        };
        if (line.classId) {
          detail.ClassRef = { value: line.classId };
        }
        if (line.customerId) {
          detail.CustomerRef = { value: line.customerId };
        }
        if (line.taxCodeId) {
          detail.TaxCodeRef = { value: line.taxCodeId };
        }
        return {
          DetailType: 'AccountBasedExpenseLineDetail',
          Amount: line.amount,
          Description: line.description,
          AccountBasedExpenseLineDetail: detail,
        };
      })(),
    })),
  };
  if (input.privateNote !== undefined && input.privateNote !== '') {
    payload.PrivateNote = input.privateNote;
  }
  if (input.docNumber !== undefined && input.docNumber !== '') {
    payload.DocNumber = input.docNumber;
  }
  if (input.dueDate !== undefined && input.dueDate !== '') {
    payload.DueDate = input.dueDate;
  }
  if (input.salesTermId !== undefined && input.salesTermId !== '') {
    payload.SalesTermRef = { value: input.salesTermId };
  }
  if (input.currencyCode !== undefined && input.currencyCode !== '') {
    payload.CurrencyRef = { value: input.currencyCode };
  }
  if (input.exchangeRate !== undefined) {
    payload.ExchangeRate = input.exchangeRate;
  }
  if (input.departmentId !== undefined && input.departmentId !== '') {
    payload.DepartmentRef = { value: input.departmentId };
  }
  if (Array.isArray(input.customFields) && input.customFields.length > 0) {
    payload.CustomField = input.customFields.map((field) => {
      const record: Record<string, unknown> = {
        Type: field.type,
      };
      if (field.definitionId) {
        record.DefinitionId = field.definitionId;
      }
      if (field.name) {
        record.Name = field.name;
      }
      if (field.type === 'StringType') {
        record.StringValue = String(field.value);
      } else if (field.type === 'NumberType') {
        record.NumberValue = Number(field.value);
      } else if (field.type === 'BooleanType') {
        record.BooleanValue = Boolean(field.value);
      }
      return record;
    });
  }

  logger.info('Creating bill in QBO', { txnDate: input.txnDate, vendorId: input.vendorId });

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to create bill', { status: response.status, error: errorText });
    throw new Error(`Failed to create bill: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Bill: QboBill };
  return { bill: data.Bill, updatedConnection };
}

export async function createPurchase(
  connection: QboConnection,
  input: {
    txnDate: string;
    paymentType: 'Cash' | 'Check' | 'CreditCard';
    paymentAccountId: string;
    docNumber?: string;
    vendorId?: string;
    privateNote?: string;
    lines: Array<{
      amount: number;
      accountId: string;
      description?: string;
    }>;
  },
): Promise<{ purchase: QboPurchase; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const url = `${baseUrl}/v3/company/${connection.realmId}/purchase`;

  const payload: Record<string, unknown> = {
    TxnDate: input.txnDate,
    PaymentType: input.paymentType,
    AccountRef: { value: input.paymentAccountId },
    Line: input.lines.map((line) => ({
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: line.amount,
      Description: line.description,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: line.accountId },
      },
    })),
  };
  if (input.docNumber !== undefined) {
    payload.DocNumber = input.docNumber;
  }
  if (input.vendorId !== undefined) {
    payload.EntityRef = { value: input.vendorId };
  }
  if (input.privateNote !== undefined) {
    payload.PrivateNote = input.privateNote;
  }

  logger.info('Creating purchase in QBO', {
    txnDate: input.txnDate,
    paymentType: input.paymentType,
    paymentAccountId: input.paymentAccountId,
    vendorId: input.vendorId,
  });

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to create purchase', { status: response.status, error: errorText });
    throw new Error(`Failed to create purchase: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Purchase: QboPurchase };
  return { purchase: data.Purchase, updatedConnection };
}

const VENDORS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const TERMS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CURRENCIES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PREFERENCES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch Vendors from QBO
 */
export async function fetchVendors(
  connection: QboConnection,
): Promise<{ vendors: QboVendor[]; updatedConnection?: QboConnection }> {
  const cacheKey = `vendors:${connection.realmId}`;

  const cached = getCached<QboVendor[]>(cacheKey);
  if (cached) {
    logger.info('Returning cached vendors', { realmId: connection.realmId, count: cached.length });
    return { vendors: cached };
  }

  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const query = `SELECT * FROM Vendor WHERE Active = true MAXRESULTS 1000`;
  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching vendors from QBO');

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch vendors', { status: response.status, error: errorText });
    throw new Error(`Failed to fetch vendors: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as QboQueryResponse;
  const vendors = data.QueryResponse.Vendor;
  const result = vendors ? vendors : [];

  setCache(cacheKey, result, VENDORS_CACHE_TTL_MS);

  return { vendors: result, updatedConnection };
}

export async function fetchTerms(
  connection: QboConnection,
): Promise<{ terms: QboTerm[]; updatedConnection?: QboConnection }> {
  const cacheKey = `terms:${connection.realmId}`;
  const cached = getCached<QboTerm[]>(cacheKey);
  if (cached) {
    logger.info('Returning cached terms', { realmId: connection.realmId, count: cached.length });
    return { terms: cached };
  }

  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const query = `SELECT * FROM Term MAXRESULTS 1000`;
  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching terms from QBO');

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch terms', { status: response.status, error: errorText });
    throw new Error(`Failed to fetch terms: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as QboQueryResponse;
  const terms = (data.QueryResponse.Term ?? []).filter((term) => term.Active !== false);
  setCache(cacheKey, terms, TERMS_CACHE_TTL_MS);
  return { terms, updatedConnection };
}

export async function fetchCurrencies(
  connection: QboConnection,
): Promise<{ currencies: QboCurrency[]; updatedConnection?: QboConnection }> {
  const cacheKey = `currencies:${connection.realmId}`;
  const cached = getCached<QboCurrency[]>(cacheKey);
  if (cached) {
    logger.info('Returning cached currencies', { realmId: connection.realmId, count: cached.length });
    return { currencies: cached };
  }

  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const query = `SELECT * FROM Currency MAXRESULTS 1000`;
  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching currencies from QBO');

  const response = await fetchWithRetry(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch currencies', { status: response.status, error: errorText });
    throw new Error(`Failed to fetch currencies: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as QboQueryResponse;
  const currencies = (data.QueryResponse.Currency ?? [])
    .filter((currency) => currency.Active !== false)
    .sort((a, b) => (a.Code ?? '').localeCompare(b.Code ?? ''));

  setCache(cacheKey, currencies, CURRENCIES_CACHE_TTL_MS);
  return { currencies, updatedConnection };
}

export async function fetchPreferences(
  connection: QboConnection,
): Promise<{ preferences: QboPreferences; updatedConnection?: QboConnection }> {
  const cacheKey = `preferences:${connection.realmId}`;
  const cached = getCached<QboPreferences>(cacheKey);
  if (cached) {
    logger.info('Returning cached preferences', { realmId: connection.realmId });
    return { preferences: cached };
  }

  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/v3/company/${connection.realmId}/preferences`;

  logger.info('Fetching preferences from QBO');

  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to fetch preferences', { status: response.status, error: errorText });
    throw new Error(`Failed to fetch preferences: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { Preferences?: QboPreferences };
  const preferences = data.Preferences ?? {};
  setCache(cacheKey, preferences, PREFERENCES_CACHE_TTL_MS);
  return { preferences, updatedConnection };
}

function buildMultipartUploadBody(params: {
  boundary: string;
  metadata: unknown;
  fileName: string;
  contentType: string;
  base64Content: string;
}): string {
  const { boundary, metadata, fileName, contentType, base64Content } = params;
  const parts: string[] = [];

  parts.push(`--${boundary}\r\n`);
  parts.push('Content-Disposition: form-data; name="file_metadata_01"; filename="attachment.json"\r\n');
  parts.push('Content-Type: application/json; charset=UTF-8\r\n');
  parts.push('Content-Transfer-Encoding: 8bit\r\n\r\n');
  parts.push(`${JSON.stringify(metadata)}\r\n`);

  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="file_content_01"; filename="${fileName}"\r\n`);
  parts.push(`Content-Type: ${contentType}\r\n`);
  parts.push('Content-Transfer-Encoding: base64\r\n\r\n');
  parts.push(`${base64Content}\r\n`);
  parts.push(`--${boundary}--\r\n`);

  return parts.join('');
}

export async function uploadBillAttachment(
  connection: QboConnection,
  input: {
    billId: string;
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
  },
): Promise<{ attachableId: string; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const activeConnection = updatedConnection ? updatedConnection : connection;
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/v3/company/${activeConnection.realmId}/upload`;

  const metadata = {
    AttachableRef: [
      {
        EntityRef: {
          type: 'Bill',
          value: input.billId,
        },
      },
    ],
    FileName: input.fileName,
    ContentType: input.contentType,
  };

  const boundary = `plutus-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const body = buildMultipartUploadBody({
    boundary,
    metadata,
    fileName: input.fileName,
    contentType: input.contentType,
    base64Content: Buffer.from(input.bytes).toString('base64'),
  });

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to upload bill attachment', {
      billId: input.billId,
      fileName: input.fileName,
      status: response.status,
      error: errorText,
    });
    throw new Error(`Failed to upload bill attachment: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    AttachableResponse?: Array<{ Attachable?: { Id?: string } }>;
  };
  const attachableId = data.AttachableResponse?.[0]?.Attachable?.Id;
  if (!attachableId) {
    throw new Error('Attachment upload succeeded but no Attachable Id returned.');
  }

  return { attachableId, updatedConnection };
}
