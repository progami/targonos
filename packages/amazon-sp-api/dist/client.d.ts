import type { AmazonSpApiConfig, TenantCode } from './types.js';
type SellingPartnerApiClient = {
    callAPI: (params: Record<string, unknown>) => Promise<unknown>;
};
export declare function getAmazonSpApiConfig(tenantCode?: TenantCode): AmazonSpApiConfig;
export declare function getAmazonClient(tenantCode?: TenantCode): SellingPartnerApiClient;
export declare function callAmazonApi<T>(tenantCode: TenantCode | undefined, params: Record<string, unknown>): Promise<T>;
export {};
//# sourceMappingURL=client.d.ts.map