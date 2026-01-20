export type AmazonRegion = 'na' | 'eu' | 'fe';
export type TenantCode = 'US' | 'UK';
export type AmazonSpApiConfig = {
    region: AmazonRegion;
    refreshToken: string;
    marketplaceId: string;
    appClientId: string;
    appClientSecret: string;
    sellerId?: string;
};
export type AmazonOrder = {
    AmazonOrderId: string;
    PurchaseDate: string;
    OrderStatus: string;
    OrderTotal?: {
        Amount: string;
        CurrencyCode: string;
    };
    NumberOfItemsShipped?: number;
    NumberOfItemsUnshipped?: number;
    MarketplaceId?: string;
    FulfillmentChannel?: string;
    ShipServiceLevel?: string;
};
export type AmazonOrderItem = {
    ASIN: string;
    SellerSKU: string;
    OrderItemId: string;
    Title: string;
    QuantityOrdered: number;
    QuantityShipped: number;
    ItemPrice?: {
        Amount: string;
        CurrencyCode: string;
    };
};
export type OrdersResponse = {
    Orders: AmazonOrder[];
    NextToken?: string;
};
export type OrderItemsResponse = {
    OrderItems: AmazonOrderItem[];
    NextToken?: string;
};
//# sourceMappingURL=types.d.ts.map