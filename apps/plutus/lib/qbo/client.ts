import OAuthClient from 'intuit-oauth';
import { createLogger } from '@targon/logger';

const logger = createLogger({ name: 'qbo-client' });

type QboEnvironment = 'sandbox' | 'production';

export interface QboClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QboEnvironment;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getQboClientConfig(): QboClientConfig {
  return {
    clientId: requireEnv('QBO_CLIENT_ID'),
    clientSecret: requireEnv('QBO_CLIENT_SECRET'),
    redirectUri: requireEnv('QBO_REDIRECT_URI'),
    environment: (process.env.QBO_SANDBOX === 'true' ? 'sandbox' : 'production') as QboEnvironment,
  };
}

export function createOAuthClient(): OAuthClient {
  const qboConfig = getQboClientConfig();
  return new OAuthClient({
    clientId: qboConfig.clientId,
    clientSecret: qboConfig.clientSecret,
    redirectUri: qboConfig.redirectUri,
    environment: qboConfig.environment,
  });
}

export function getAuthorizationUrl(state: string): string {
  const oauthClient = createOAuthClient();
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
  logger.info('Generated QBO authorization URL');
  return authUri;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  realmId: string;
}

export async function exchangeCodeForTokens(
  authorizationCode: string,
  realmId: string,
): Promise<TokenExchangeResult> {
  const qboConfig = getQboClientConfig();
  const oauthClient = createOAuthClient();

  // Construct the full URL that Intuit expects
  const url = `${qboConfig.redirectUri}?code=${authorizationCode}&realmId=${realmId}`;

  logger.info('Exchanging authorization code for tokens');
  const authResponse = await oauthClient.createToken(url);
  const token = authResponse.getJson();

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    expiresIn: token.expires_in,
    realmId,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenExchangeResult> {
  const oauthClient = createOAuthClient();

  logger.info('Refreshing QBO access token');
  const authResponse = await oauthClient.refreshUsingToken(refreshToken);
  const token = authResponse.getJson();

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    expiresIn: token.expires_in,
    realmId: '', // Not returned on refresh
  };
}

export function getApiBaseUrl(): string {
  const environment = process.env.QBO_SANDBOX === 'true' ? 'sandbox' : 'production';
  return environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}
