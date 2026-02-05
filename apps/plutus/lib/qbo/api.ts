import { getApiBaseUrl, refreshAccessToken } from './client';
import { createLogger } from '@targon/logger';

const logger = createLogger({ name: 'qbo-api' });

// Default timeout for QBO API calls (60 seconds)
const QBO_TIMEOUT_MS = 60000;

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
  PrivateNote?: string;
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
    conditions.push(`TxnDate >= '${params.startDate}'`);
  }
  if (params.endDate) {
    conditions.push(`TxnDate <= '${params.endDate}'`);
  }
  if (params.docNumberContains) {
    conditions.push(`DocNumber LIKE '%${params.docNumberContains}%'`);
  }

  let query = `SELECT * FROM JournalEntry`;
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDERBY TxnDate DESC`;
  query += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching journal entries from QBO', { query });

  const response = await fetchWithTimeout(queryUrl, {
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
      const countResponse = await fetchWithTimeout(
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
        } else {
          totalCount = journalEntries.length;
        }
      }
    } catch {
      // ignore
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

  const response = await fetchWithTimeout(url, {
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

export interface QboQueryResponse {
  QueryResponse: {
    Purchase?: QboPurchase[];
    Bill?: QboBill[];
    Account: QboAccount[];
    JournalEntry?: QboJournalEntry[];
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
    let newTokens: Awaited<ReturnType<typeof refreshAccessToken>>;
    try {
      newTokens = await refreshAccessToken(connection.refreshToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('QBO token refresh failed', { error: message });
      throw new QboAuthError('Session expired. Please reconnect to QuickBooks.');
    }
    const updatedConnection: QboConnection = {
      ...connection,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: new Date(Date.now() + newTokens.expiresIn * 1000).toISOString(),
    };
    return { accessToken: newTokens.accessToken, updatedConnection };
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
    conditions.push(`TxnDate >= '${startDate}'`);
  }
  if (endDate) {
    conditions.push(`TxnDate <= '${endDate}'`);
  }
  if (docNumberContains) {
    conditions.push(`DocNumber LIKE '%${docNumberContains}%'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDERBY TxnDate DESC`;
  query += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching purchases from QBO', { query });

  const response = await fetchWithTimeout(queryUrl, {
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
      const countResponse = await fetchWithTimeout(
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
        } else {
          totalCount = purchases.length;
        }
      }
    } catch {
      // ignore
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
    conditions.push(`TxnDate >= '${startDate}'`);
  }
  if (endDate) {
    conditions.push(`TxnDate <= '${endDate}'`);
  }
  if (docNumberContains) {
    conditions.push(`DocNumber LIKE '%${docNumberContains}%'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDERBY TxnDate DESC`;
  query += ` STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching bills from QBO', { query });

  const response = await fetchWithTimeout(queryUrl, {
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
      const countResponse = await fetchWithTimeout(
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
        } else {
          totalCount = bills.length;
        }
      }
    } catch {
      // ignore
    }
  }

  return { bills, totalCount, updatedConnection };
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

  const response = await fetchWithTimeout(url, {
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

  const response = await fetchWithTimeout(url, {
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

  const response = await fetchWithTimeout(url, {
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

/**
 * Fetch Chart of Accounts from QBO
 */
export async function fetchAccounts(
  connection: QboConnection,
  options?: {
    includeInactive?: boolean;
  },
): Promise<{ accounts: QboAccount[]; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const includeInactive = options?.includeInactive === true;
  const query = includeInactive
    ? `SELECT * FROM Account MAXRESULTS 1000`
    : `SELECT * FROM Account WHERE Active = true MAXRESULTS 1000`;
  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching accounts from QBO', { includeInactive });

  const response = await fetchWithTimeout(queryUrl, {
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
  return { accounts: accounts ? accounts : [], updatedConnection };
}

export async function fetchAccountsByFullyQualifiedName(
  connection: QboConnection,
  fullyQualifiedName: string,
): Promise<{ accounts: QboAccount[]; updatedConnection?: QboConnection }> {
  const { accessToken, updatedConnection } = await getValidToken(connection);
  const baseUrl = getApiBaseUrl();

  const query = `SELECT * FROM Account WHERE FullyQualifiedName = '${fullyQualifiedName.replace(/'/g, "\\'")}' MAXRESULTS 10`;
  const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}`;

  logger.info('Fetching account by fully qualified name from QBO', { fullyQualifiedName });

  const response = await fetchWithTimeout(queryUrl, {
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

  const response = await fetchWithTimeout(url, {
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

  const response = await fetchWithTimeout(url, {
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
