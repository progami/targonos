import { createRequire } from 'node:module';
const clientCache = new Map();
const require = createRequire(import.meta.url);
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
export function getAmazonSpApiConfig(tenantCode) {
    const appClientId = readEnvVar('AMAZON_SP_APP_CLIENT_ID');
    const appClientSecret = readEnvVar('AMAZON_SP_APP_CLIENT_SECRET');
    const refreshToken = tenantCode
        ? readEnvVar(`AMAZON_REFRESH_TOKEN_${tenantCode}`)
        : readEnvVar('AMAZON_REFRESH_TOKEN');
    const marketplaceId = tenantCode
        ? readEnvVar(`AMAZON_MARKETPLACE_ID_${tenantCode}`)
        : readEnvVar('AMAZON_MARKETPLACE_ID');
    const regionRaw = tenantCode
        ? readEnvVar(`AMAZON_SP_API_REGION_${tenantCode}`)
        : readEnvVar('AMAZON_SP_API_REGION');
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
    if (!regionRaw) {
        missing.push(tenantCode ? `AMAZON_SP_API_REGION_${tenantCode}` : 'AMAZON_SP_API_REGION');
    }
    if (missing.length > 0) {
        throw new Error(`Amazon SP-API not configured. Missing env vars: ${missing.join(', ')}`);
    }
    const region = normalizeRegion(regionRaw);
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
        sellerId,
    };
}
function getCacheKey(config) {
    return `${config.region}:${config.marketplaceId}:${config.refreshToken}`;
}
function createAmazonClient(config) {
    // amazon-sp-api is CJS; use createRequire for ESM compatibility.
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
