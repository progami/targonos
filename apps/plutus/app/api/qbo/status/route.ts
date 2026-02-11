import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { getApiBaseUrl } from '@/lib/qbo/client';
import { getValidToken } from '@/lib/qbo/api';
import type { QboConnectionStatus, QboCompanyInfoResponse, QboPreferences } from '@/lib/qbo/types';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-status' });

export async function GET() {
  const connection = await getQboConnection();

  if (!connection) {
    return NextResponse.json<QboConnectionStatus>({
      connected: false,
    });
  }

  // Try to get a valid token (auto-refreshes if expired)
  let accessToken = connection.accessToken;
  try {
    const result = await getValidToken(connection);
    accessToken = result.accessToken;

    if (result.updatedConnection) {
      await saveServerQboConnection(result.updatedConnection);
      logger.info('QBO token refreshed successfully');
    }
  } catch (refreshError) {
    logger.warn('Token refresh failed', {
      error: refreshError instanceof Error ? refreshError.message : String(refreshError),
    });
    return NextResponse.json<QboConnectionStatus>({
      connected: false,
      error: 'Session expired. Please reconnect to QuickBooks.',
    });
  }

  // Fetch company info to verify connection and get company name
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(
      `${baseUrl}/v3/company/${connection.realmId}/query?query=select * from CompanyInfo`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );

    if (response.status === 401 || response.status === 403) {
      // Token is truly invalid - user needs to reconnect
      logger.error('QBO authentication failed', { status: response.status });
      return NextResponse.json<QboConnectionStatus>({
        connected: false,
        error: 'Session expired. Please reconnect to QuickBooks.',
      });
    }

    if (!response.ok) {
      // Other error - still connected but couldn't get company info
      logger.error('Failed to fetch company info', { status: response.status });
      return NextResponse.json<QboConnectionStatus>({
        connected: true,
        realmId: connection.realmId,
      });
    }

    const data = (await response.json()) as QboCompanyInfoResponse;
    const companyInfo = data.QueryResponse.CompanyInfo?.[0];

    // Also fetch preferences to get home currency
    let homeCurrency: string | undefined;
    try {
      const prefsResponse = await fetch(`${baseUrl}/v3/company/${connection.realmId}/preferences`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (prefsResponse.ok) {
        const prefsData = (await prefsResponse.json()) as { Preferences: QboPreferences };
        homeCurrency = prefsData.Preferences?.CurrencyPrefs?.HomeCurrency?.value;
      }
    } catch (prefsError) {
      logger.warn('Failed to fetch preferences', {
        error: prefsError instanceof Error ? prefsError.message : String(prefsError),
      });
    }

    return NextResponse.json<QboConnectionStatus>({
      connected: true,
      realmId: connection.realmId,
      companyName: companyInfo?.CompanyName,
      homeCurrency,
    });
  } catch (error) {
    // Network error - assume still connected, just can't verify
    logger.error('Failed to verify QBO connection', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json<QboConnectionStatus>({
      connected: true,
      realmId: connection.realmId,
    });
  }
}
