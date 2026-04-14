import type { QboConnectionErrorCode } from './types';

type SearchParamValue = string | string[] | undefined;

function readErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

function firstSearchParamValue(value: SearchParamValue): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const firstValue = value[0];
    if (firstValue === undefined) {
      return null;
    }
    return firstValue;
  }
  return null;
}

export function classifyQboRefreshFailure(error: unknown): QboConnectionErrorCode {
  const normalized = readErrorText(error).trim().toLowerCase();

  if (normalized.includes('ci-placeholder')) {
    return 'oauth_client_mismatch';
  }

  if (normalized.includes('invalid_client')) {
    return 'oauth_client_mismatch';
  }

  if (normalized.includes('invalid_grant')) {
    return 'refresh_token_invalid';
  }

  if (normalized.includes('refresh token is invalid')) {
    return 'refresh_token_invalid';
  }

  if (normalized.includes('authorize again')) {
    return 'refresh_token_invalid';
  }

  return 'session_expired';
}

export function classifyQboVerificationFailure(status: number): QboConnectionErrorCode {
  if (status === 403) {
    return 'qbo_company_forbidden';
  }

  return 'session_expired';
}

export function getQboConnectionErrorMessage(code: QboConnectionErrorCode): string {
  switch (code) {
    case 'connect_failed':
      return 'Plutus could not start the QuickBooks connection flow. Please try again.';
    case 'invalid_params':
      return 'QuickBooks returned incomplete connection parameters. Please try again.';
    case 'invalid_state':
      return 'Security check failed. Please try connecting to QuickBooks again.';
    case 'oauth_client_mismatch':
      return 'Plutus cannot authenticate with QuickBooks because the server OAuth client is invalid. Ask a platform admin to fix the QuickBooks app credentials before reconnecting.';
    case 'qbo_company_forbidden':
      return 'QuickBooks rejected access to this company. Reconnect as a QuickBooks Company Admin and make sure you authorize the correct company.';
    case 'refresh_token_invalid':
      return 'The saved QuickBooks authorization is no longer valid. Reconnect QuickBooks to continue.';
    case 'session_expired':
      return 'Session expired. Please reconnect to QuickBooks.';
    case 'token_exchange_failed':
      return 'QuickBooks did not complete the connection. Please try again.';
  }
}

export function buildPlutusHomeRedirectPath(searchParams: Record<string, SearchParamValue>): string {
  const params = new URLSearchParams();

  const connected = firstSearchParamValue(searchParams.connected);
  if (connected !== null) {
    params.set('connected', connected);
  }

  const error = firstSearchParamValue(searchParams.error);
  if (error !== null) {
    params.set('error', error);
  }

  const query = params.toString();
  if (query === '') {
    return '/settlements';
  }

  return `/settlements?${query}`;
}
