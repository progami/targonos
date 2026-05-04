import { Readable } from 'stream';
export interface S3UploadOptions {
    contentType?: string;
    /**
     * Content length in bytes. When provided for streaming uploads, the SDK can send a non-chunked
     * request which avoids multipart permissions and improves compatibility with some proxies.
     */
    contentLength?: number;
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
export interface S3ObjectStreamResult {
    body: Readable;
    contentType: string | undefined;
    contentLength: number | undefined;
    contentRange: string | undefined;
    acceptRanges: string | undefined;
    etag: string | undefined;
    lastModified: Date | undefined;
}
export type FileContext = {
    type: 'transaction';
    transactionId: string;
    documentType: string;
} | {
    type: 'inbound';
    inboundOrderId: string;
    /** Optional tenant code (e.g., US/UK) to keep multi-tenant uploads organized in S3. */
    tenantCode?: string;
    /** Optional public order number (e.g., IN-0001) to keep inbound uploads human-navigable in S3. */
    inboundOrderNumber?: string;
    stage: 'RFQ' | 'ISSUED' | 'MANUFACTURING' | 'OCEAN' | 'WAREHOUSE' | 'SHIPPED';
    documentType: string;
} | {
    type: 'outbound-order';
    outboundOrderId: string;
    /** Optional tenant code (e.g., US/UK) to keep multi-tenant uploads organized in S3. */
    tenantCode?: string;
    /** Optional public order number (e.g., OUT-0001) to keep outbound uploads human-navigable in S3. */
    outboundOrderNumber?: string;
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
    getObjectStream(key: string, options?: {
        range?: string;
    }): Promise<S3ObjectStreamResult>;
    deleteFile(key: string): Promise<void>;
    listFiles(prefix: string, maxKeys?: number): Promise<string[]>;
    copyFile(sourceKey: string, destinationKey: string): Promise<void>;
    private getCacheControl;
    private getContentDisposition;
    cleanupExpiredFiles(): Promise<number>;
}
export declare function getS3Service(): S3Service;
export declare function isValidFileContext(context: unknown): context is FileContext;
