import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createLogger } from '@targon/logger';

import { getApiBaseUrl } from '@/lib/qbo/client';
import { QboAuthError, getValidToken } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-tax-codes' });

type QboTaxCodeRow = {
  Id: string;
  Name: string;
  Active?: boolean;
  Taxable?: boolean;
};

type QboTaxCodeQueryResponse = {
  QueryResponse?: {
    TaxCode?: QboTaxCodeRow[];
  };
};

export async function GET() {
  const requestId = randomUUID();

  try {
    const connection = await getQboConnection();
    if (!connection) {
      logger.info('Missing qbo_connection', { requestId });
      return NextResponse.json({ error: 'Not connected to QBO', requestId }, { status: 401 });
    }

    const tokenResult = await getValidToken(connection);
    if (tokenResult.updatedConnection) {
      await saveServerQboConnection(tokenResult.updatedConnection);
    }

    const baseUrl = getApiBaseUrl();
    const query = 'SELECT * FROM TaxCode MAXRESULTS 1000';
    const queryUrl = `${baseUrl}/v3/company/${connection.realmId}/query?query=${encodeURIComponent(query)}&minorversion=70`;

    logger.info('Fetching QBO tax codes', { requestId, realmId: connection.realmId });

    const response = await fetch(queryUrl, {
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to fetch tax codes', { requestId, status: response.status, error: errorText });
      return NextResponse.json(
        {
          error: 'Failed to fetch tax codes',
          details: errorText,
          requestId,
        },
        { status: response.status },
      );
    }

    const data = (await response.json()) as QboTaxCodeQueryResponse;
    const rows = Array.isArray(data.QueryResponse?.TaxCode) ? data.QueryResponse.TaxCode : [];

    const taxCodes = rows
      .map((row) => ({
        id: row.Id,
        name: row.Name,
        active: row.Active === undefined ? true : row.Active,
        taxable: row.Taxable === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ taxCodes, total: taxCodes.length, requestId });
  } catch (error) {
    if (error instanceof QboAuthError) {
      logger.warn('QBO auth required', { requestId });
      return NextResponse.json({ error: error.message, requestId }, { status: 401 });
    }

    logger.error('Failed to fetch tax codes', { requestId, error });
    return NextResponse.json(
      {
        error: 'Failed to fetch tax codes',
        details: error instanceof Error ? error.message : String(error),
        requestId,
      },
      { status: 500 },
    );
  }
}
