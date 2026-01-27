import { Readable } from 'stream';
export interface S3UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
    tags?: Record<string, string>;
    cacheControl?: string;
    contentDisposition?: string;
    expiresAt?: Date;
}
export interface S3UploadResult {
    key: string;
    bucket: string;
    url: string;
    etag: string;
    size: number;
    contentType: string;
    versionId?: string;
}
export interface S3DownloadOptions {
    responseContentType?: string;
    responseContentDisposition?: string;
    expiresIn?: number;
}
export type FileContext = {
    type: 'transaction';
    transactionId: string;
    documentType: string;
} | {
    type: 'purchase-order';
    purchaseOrderId: string;
    /** Optional tenant code (e.g., US/UK) to keep multi-tenant uploads organized in S3. */
    tenantCode?: string;
    /** Optional public order number (e.g., PO-0001) to keep PO uploads human-navigable in S3. */
    purchaseOrderNumber?: string;
    stage: 'DRAFT' | 'ISSUED' | 'MANUFACTURING' | 'OCEAN' | 'WAREHOUSE' | 'SHIPPED';
    documentType: string;
} | {
    type: 'fulfillment-order';
    fulfillmentOrderId: string;
    /** Optional tenant code (e.g., US/UK) to keep multi-tenant uploads organized in S3. */
    tenantCode?: string;
    /** Optional public order number (e.g., FO-0001) to keep FO uploads human-navigable in S3. */
    fulfillmentOrderNumber?: string;
    stage: 'PACKING' | 'SHIPPING' | 'DELIVERY';
    documentType: string;
} | {
    type: 'warehouse-rate-list';
    warehouseId: string;
} | {
    type: 'export-temp';
    userId: string;
    exportType: string;
} | {
    type: 'export-scheduled';
    frequency: 'daily' | 'weekly' | 'monthly';
    date: Date;
    reportType: string;
} | {
    type: 'template';
    templateType: string;
} | {
    type: 'generated-invoice';
    invoiceId: string;
    invoiceNumber: string;
};
export declare class S3Service {
    private client;
    private bucket;
    private region;
    private urlExpiry;
    constructor();
    generateKey(context: FileContext, filename: string): string;
    private sanitizeFilename;
    private encodeMetadataValue;
    private sanitizeMetadata;
    uploadFile(file: Buffer | Readable | File, key: string, options?: S3UploadOptions, onProgress?: (progress: number) => void): Promise<S3UploadResult>;
    getPresignedUrl(key: string, operation?: 'get' | 'put', options?: S3DownloadOptions & {
        contentType?: string;
    }): Promise<string>;
    getPublicUrl(key: string): string;
    downloadFile(key: string): Promise<Buffer>;
    streamFile(key: string): Promise<Readable>;
    deleteFile(key: string): Promise<void>;
    listFiles(prefix: string, maxKeys?: number): Promise<string[]>;
    copyFile(sourceKey: string, destinationKey: string): Promise<void>;
    private getCacheControl;
    private getContentDisposition;
    cleanupExpiredFiles(): Promise<number>;
}
export declare function getS3Service(): S3Service;
export declare function isValidFileContext(context: unknown): context is FileContext;
