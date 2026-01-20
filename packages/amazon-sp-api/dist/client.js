const clientCache = new Map();
function readEnvVar(name) {
    const value = process.env[name];
    if (!value)
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function normalizeRegion(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'eu' || normalized === 'na' || normalized === 'fe') {
        return normalized;
    }
    return null;
}
function getDefaultMarketplaceId(tenantCode) {
    if (tenantCode === 'US')
        return 'ATVPDKIKX0DER';
    if (tenantCode === 'UK')
        return 'A1F83G8C2ARO7P';
    return undefined;
}
function getDefaultRegion(tenantCode) {
    if (tenantCode === 'US')
        return 'na';
    if (tenantCode === 'UK')
        return 'eu';
    return 'eu';
}
export function getAmazonSpApiConfig(tenantCode) {
    const appClientId = readEnvVar('AMAZON_SP_APP_CLIENT_ID');
    const appClientSecret = readEnvVar('AMAZON_SP_APP_CLIENT_SECRET');
    const refreshToken = tenantCode
        ? readEnvVar(`AMAZON_REFRESH_TOKEN_${tenantCode}`)
        : readEnvVar('AMAZON_REFRESH_TOKEN');
    const marketplaceId = (tenantCode ? readEnvVar(`AMAZON_MARKETPLACE_ID_${tenantCode}`) : readEnvVar('AMAZON_MARKETPLACE_ID')) ||
        getDefaultMarketplaceId(tenantCode);
    const regionRaw = (tenantCode ? readEnvVar(`AMAZON_SP_API_REGION_${tenantCode}`) : readEnvVar('AMAZON_SP_API_REGION')) ||
        getDefaultRegion(tenantCode);
    const region = normalizeRegion(regionRaw);
    const sellerId = tenantCode
        ? readEnvVar(`AMAZON_SELLER_ID_${tenantCode}`)
        : readEnvVar('AMAZON_SELLER_ID');
    const missing = [];
    if (!appClientId)
        missing.push('AMAZON_SP_APP_CLIENT_ID');
    if (!appClientSecret)
        missing.push('AMAZON_SP_APP_CLIENT_SECRET');
    if (!refreshToken) {
        missing.push(tenantCode ? `AMAZON_REFRESH_TOKEN_${tenantCode}` : 'AMAZON_REFRESH_TOKEN');
    }
    if (!marketplaceId) {
        missing.push(tenantCode ? `AMAZON_MARKETPLACE_ID_${tenantCode}` : 'AMAZON_MARKETPLACE_ID');
    }
    if (missing.length > 0) {
        throw new Error(`Amazon SP-API not configured. Missing env vars: ${missing.join(', ')}`);
    }
    if (!region) {
        const key = tenantCode ? `AMAZON_SP_API_REGION_${tenantCode}` : 'AMAZON_SP_API_REGION';
        throw new Error(`Invalid ${key} value "${regionRaw}". Expected one of: eu, na, fe.`);
    }
    return {
        region,
        refreshToken: refreshToken,
        marketplaceId: marketplaceId,
        appClientId: appClientId,
        appClientSecret: appClientSecret,
        sellerId: sellerId || undefined,
    };
}
function getCacheKey(config) {
    return `${config.region}:${config.marketplaceId}:${config.refreshToken}`;
}
function createAmazonClient(config) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SellingPartnerAPI = require('amazon-sp-api');
    return new SellingPartnerAPI({
        region: config.region,
        refresh_token: config.refreshToken,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: config.appClientId,
            SELLING_PARTNER_APP_CLIENT_SECRET: config.appClientSecret,
        },
        options: {
            auto_request_tokens: true,
            auto_request_throttled: true,
            use_sandbox: false,
        },
    });
}
export function getAmazonClient(tenantCode) {
    const config = getAmazonSpApiConfig(tenantCode);
    const key = getCacheKey(config);
    const cached = clientCache.get(key);
    if (cached)
        return cached;
    const client = createAmazonClient(config);
    clientCache.set(key, client);
    return client;
}
export async function callAmazonApi(tenantCode, params) {
    const client = getAmazonClient(tenantCode);
    return (await client.callAPI(params));
}
