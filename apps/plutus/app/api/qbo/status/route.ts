import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { getApiBaseUrl } from '@/lib/qbo/client';
import { QboAuthError, getValidToken } from '@/lib/qbo/api';
import { classifyQboVerificationFailure, getQboConnectionErrorMessage } from '@/lib/qbo/connection-feedback';
import type { QboConnectionStatus, QboCompanyInfoResponse, QboPreferences } from '@/lib/qbo/types';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { decodePlutusPortalSession, isPlatformAdminPortalSession } from '@/lib/portal-session';

const logger = createLogger({ name: 'qbo-status' });

export async function GET(request: Request) {
  const session = await decodePlutusPortalSession(request.headers.get('cookie'));
  const canConnect = isPlatformAdminPortalSession(session);

  const connection = await getQboConnection();

  if (!connection) {
    return NextResponse.json<QboConnectionStatus>({
      connected: false,
      canConnect,
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
    if (!(refreshError instanceof QboAuthError)) {
      throw refreshError;
    }
    if (refreshError.code === undefined) {
      throw new Error('QboAuthError.code is required');
    }

    logger.warn('Token refresh failed', {
      realmId: connection.realmId,
      error: refreshError.details ?? refreshError.message,
      errorCode: refreshError.code,
    });
    return NextResponse.json<QboConnectionStatus>({
      connected: false,
      canConnect,
      errorCode: refreshError.code,
      error: refreshError.message,
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
      const errorCode = classifyQboVerificationFailure(response.status);
      logger.error('QBO authentication failed', {
        realmId: connection.realmId,
        status: response.status,
        errorCode,
      });
      return NextResponse.json<QboConnectionStatus>({
        connected: false,
        canConnect,
        errorCode,
        error: getQboConnectionErrorMessage(errorCode),
      });
    }

    if (!response.ok) {
      // Other error - still connected but couldn't get company info
      logger.error('Failed to fetch company info', { status: response.status });
      return NextResponse.json<QboConnectionStatus>({
        connected: true,
        canConnect,
        realmId: connection.realmId,
      });
    }

    const data = (await response.json()) as QboCompanyInfoResponse;
    const companyInfo = data.QueryResponse.CompanyInfo?.[0];

    // Also fetch preferences to get home currency
    let homeCurrency: string | undefined;
    let usingSalesTax: boolean | undefined;
    let partnerTaxEnabled: boolean | undefined;
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
        usingSalesTax = prefsData.Preferences?.TaxPrefs?.UsingSalesTax;
        partnerTaxEnabled = prefsData.Preferences?.TaxPrefs?.PartnerTaxEnabled;
      }
    } catch (prefsError) {
      logger.warn('Failed to fetch preferences', {
        error: prefsError instanceof Error ? prefsError.message : String(prefsError),
      });
    }

    return NextResponse.json<QboConnectionStatus>({
      connected: true,
      canConnect,
      realmId: connection.realmId,
      companyName: companyInfo?.CompanyName,
      homeCurrency,
      usingSalesTax,
      partnerTaxEnabled,
    });
  } catch (error) {
    // Network error - assume still connected, just can't verify
    logger.error('Failed to verify QBO connection', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json<QboConnectionStatus>({
      connected: true,
      canConnect,
      realmId: connection.realmId,
    });
  }
}
