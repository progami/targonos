import { callAmazonApi, getAmazonSpApiConfig } from './client.js';
/**
 * Fetch orders from Amazon SP API for a given date range.
 */
export async function getOrders(tenantCode, options) {
    const config = getAmazonSpApiConfig(tenantCode);
    const allOrders = [];
    let nextToken;
    do {
        const query = {
            MarketplaceIds: [config.marketplaceId],
            CreatedAfter: options.createdAfter.toISOString(),
        };
        if (options.createdBefore) {
            query.CreatedBefore = options.createdBefore.toISOString();
        }
        if (options.orderStatuses?.length) {
            query.OrderStatuses = options.orderStatuses;
        }
        if (nextToken) {
            query.NextToken = nextToken;
        }
        const response = await callAmazonApi(tenantCode, {
            operation: 'getOrders',
            endpoint: 'orders',
            query,
        });
        allOrders.push(...(response.Orders ?? []));
        nextToken = response.NextToken;
    } while (nextToken);
    return allOrders;
}
/**
 * Fetch order items for a specific order.
 */
export async function getOrderItems(tenantCode, orderId) {
    const allItems = [];
    let nextToken;
    do {
        const query = nextToken ? { NextToken: nextToken } : {};
        const response = await callAmazonApi(tenantCode, {
            operation: 'getOrderItems',
            endpoint: 'orders',
            path: { orderId },
            query,
        });
        allItems.push(...(response.OrderItems ?? []));
        nextToken = response.NextToken;
    } while (nextToken);
    return allItems;
}
/**
 * Fetch orders with their items for a given date range.
 * Summarizes units by ASIN.
 */
export async function getOrdersWithItems(tenantCode, options) {
    const orders = await getOrders(tenantCode, options);
    const ordersWithItems = [];
    const byStatus = {};
    const byAsin = {};
    let totalUnits = 0;
    for (const order of orders) {
        // Count by status
        const status = order.OrderStatus ?? 'Unknown';
        byStatus[status] = (byStatus[status] ?? 0) + 1;
        // Skip cancelled orders for unit counts
        if (status === 'Canceled' || status === 'Cancelled') {
            ordersWithItems.push({ ...order, items: [] });
            continue;
        }
        // Fetch items for this order
        const items = await getOrderItems(tenantCode, order.AmazonOrderId);
        for (const item of items) {
            const asin = item.ASIN;
            const qty = item.QuantityOrdered ?? 0;
            totalUnits += qty;
            if (!byAsin[asin]) {
                byAsin[asin] = { units: 0, sku: item.SellerSKU ?? '' };
            }
            byAsin[asin].units += qty;
        }
        ordersWithItems.push({ ...order, items });
    }
    return {
        dateRange: {
            start: options.createdAfter.toISOString(),
            end: options.createdBefore?.toISOString() ?? new Date().toISOString(),
        },
        totalOrders: orders.length,
        totalUnits,
        byStatus,
        byAsin,
        orders: ordersWithItems,
    };
}
/**
 * Get units sold for a specific ASIN in a date range.
 */
export async function getUnitsForAsin(tenantCode, asin, options) {
    const summary = await getOrdersWithItems(tenantCode, {
        ...options,
        orderStatuses: ['Unshipped', 'PartiallyShipped', 'Shipped'],
    });
    const asinData = summary.byAsin[asin];
    const matchingOrders = [];
    for (const order of summary.orders) {
        for (const item of order.items) {
            if (item.ASIN === asin) {
                matchingOrders.push({
                    orderId: order.AmazonOrderId,
                    purchaseDate: order.PurchaseDate,
                    status: order.OrderStatus,
                    quantity: item.QuantityOrdered,
                });
            }
        }
    }
    return {
        asin,
        sku: asinData?.sku ?? null,
        units: asinData?.units ?? 0,
        orders: matchingOrders,
    };
}
