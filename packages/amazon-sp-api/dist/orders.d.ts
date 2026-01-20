import type { TenantCode, AmazonOrder, AmazonOrderItem } from './types.js';
export type OrderWithItems = AmazonOrder & {
    items: AmazonOrderItem[];
};
export type OrdersSummary = {
    dateRange: {
        start: string;
        end: string;
    };
    totalOrders: number;
    totalUnits: number;
    byStatus: Record<string, number>;
    byAsin: Record<string, {
        units: number;
        sku: string;
    }>;
    orders: OrderWithItems[];
};
/**
 * Fetch orders from Amazon SP API for a given date range.
 */
export declare function getOrders(tenantCode: TenantCode, options: {
    createdAfter: Date;
    createdBefore?: Date;
    orderStatuses?: string[];
}): Promise<AmazonOrder[]>;
/**
 * Fetch order items for a specific order.
 */
export declare function getOrderItems(tenantCode: TenantCode, orderId: string): Promise<AmazonOrderItem[]>;
/**
 * Fetch orders with their items for a given date range.
 * Summarizes units by ASIN.
 */
export declare function getOrdersWithItems(tenantCode: TenantCode, options: {
    createdAfter: Date;
    createdBefore?: Date;
    orderStatuses?: string[];
}): Promise<OrdersSummary>;
/**
 * Get units sold for a specific ASIN in a date range.
 */
export declare function getUnitsForAsin(tenantCode: TenantCode, asin: string, options: {
    createdAfter: Date;
    createdBefore?: Date;
}): Promise<{
    asin: string;
    sku: string | null;
    units: number;
    orders: Array<{
        orderId: string;
        purchaseDate: string;
        status: string;
        quantity: number;
    }>;
}>;
//# sourceMappingURL=orders.d.ts.map