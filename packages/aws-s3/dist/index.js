import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand, } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import crypto from 'crypto';
import { Readable } from 'stream';
import mime from 'mime-types';
export class S3Service {
    client;
    bucket;
    region;
    urlExpiry;
    constructor() {
        this.region = process.env.AWS_REGION || process.env.S3_BUCKET_REGION || 'us-east-1';
        const environment = process.env.NODE_ENV || 'development';
        const defaultBucket = environment === 'production' ? 'targon-production' : 'targon-development';
        this.bucket = process.env.S3_BUCKET_NAME || defaultBucket;
        this.urlExpiry = parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '3600', 10);
        if (!this.bucket) {
            throw new Error('S3_BUCKET_NAME environment variable is required');
        }
        const clientConfig = {
            region: this.region,
            useAccelerateEndpoint: process.env.S3_USE_ACCELERATED_ENDPOINT === 'true',
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        };
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            clientConfig.credentials = {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            };
        }
        this.client = new S3Client(clientConfig);
    }
    generateKey(context, filename) {
        const sanitizedFilename = this.sanitizeFilename(filename);
        const timestamp = Date.now();
        const hash = crypto.randomBytes(4).toString('hex');
        switch (context.type) {
            case 'transaction': {
                const date = new Date();
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const documentType = this.sanitizeFilename(context.documentType);
                return `transactions/${year}/${month}/${context.transactionId}/${documentType}_${timestamp}_${hash}_${sanitizedFilename}`;
            }
            case 'fulfillment-order': {
                const tenant = context.tenantCode ? this.sanitizeFilename(context.tenantCode) : 'unknown';
                const fulfillmentOrderNumber = context.fulfillmentOrderNumber
                    ? this.sanitizeFilename(context.fulfillmentOrderNumber)
                    : null;
                const fulfillmentOrderFolder = fulfillmentOrderNumber
                    ? `${fulfillmentOrderNumber}--${context.fulfillmentOrderId}`
                    : context.fulfillmentOrderId;
                const stage = this.sanitizeFilename(context.stage);
                const documentType = this.sanitizeFilename(context.documentType);
                return `fulfillment-orders/${tenant}/${fulfillmentOrderFolder}/${stage}/${documentType}/${timestamp}_${hash}_${sanitizedFilename}`;
            }
            case 'purchase-order': {
                const tenant = context.tenantCode ? this.sanitizeFilename(context.tenantCode) : 'unknown';
                const purchaseOrderNumber = context.purchaseOrderNumber
                    ? this.sanitizeFilename(context.purchaseOrderNumber)
                    : null;
                const purchaseOrderFolder = purchaseOrderNumber
                    ? `${purchaseOrderNumber}--${context.purchaseOrderId}`
                    : context.purchaseOrderId;
                const documentType = this.sanitizeFilename(context.documentType);
                // Keep all documents for a single PO under one stable prefix (no year/month sharding),
                // so uploads over multiple months don't scatter across folders.
                return `purchase-orders/${tenant}/${purchaseOrderFolder}/${context.stage}/${documentType}/${timestamp}_${hash}_${sanitizedFilename}`;
            }
            case 'export-temp': {
                const exportType = this.sanitizeFilename(context.exportType);
                return `exports/temp/${context.userId}/${exportType}_${timestamp}_${sanitizedFilename}`;
            }
            case 'export-scheduled': {
                const dateStr = context.date.toISOString().split('T')[0];
                const reportType = this.sanitizeFilename(context.reportType);
                return `exports/scheduled/${context.frequency}/${dateStr}/${reportType}_${timestamp}_${sanitizedFilename}`;
            }
            case 'template': {
                const version = new Date().toISOString().split('T')[0].replace(/-/g, '');
                const templateType = this.sanitizeFilename(context.templateType);
                return `templates/${templateType}_v${version}_${sanitizedFilename}`;
            }
            case 'generated-invoice': {
                const date = new Date();
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const invoiceNumber = this.sanitizeFilename(context.invoiceNumber);
                return `generated-invoices/${year}/${month}/${context.invoiceId}/invoice_${invoiceNumber}_${timestamp}.pdf`;
            }
            case 'warehouse-rate-list': {
                return `warehouses/${context.warehouseId}/rate-lists/${timestamp}_${hash}_${sanitizedFilename}`;
            }
            default:
                throw new Error('Unknown file context type');
        }
    }
    sanitizeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();
    }
    async uploadFile(file, key, options = {}, onProgress) {
        try {
            let uploadBody;
            let fileSize;
            if (typeof File !== 'undefined' && file instanceof File) {
                const arrayBuffer = await file.arrayBuffer();
                uploadBody = Buffer.from(arrayBuffer);
                fileSize = file.size;
                options.contentType = options.contentType || file.type;
            }
            else if (Buffer.isBuffer(file)) {
                uploadBody = file;
                fileSize = file.length;
            }
            else if (file instanceof Readable) {
                uploadBody = file;
                fileSize = 0;
            }
            else {
                throw new Error('Unsupported file type for upload');
            }
            const contentType = options.contentType || mime.lookup(key) || 'application/octet-stream';
            const metadata = {
                ...options.metadata,
                uploadedAt: new Date().toISOString(),
            };
            if (options.expiresAt) {
                metadata.expiresAt = options.expiresAt.toISOString();
            }
            const uploadParams = {
                Bucket: this.bucket,
                Key: key,
                Body: uploadBody,
                ContentType: contentType,
                Metadata: metadata,
                ServerSideEncryption: 'AES256',
                CacheControl: options.cacheControl || this.getCacheControl(key),
                ContentDisposition: options.contentDisposition || this.getContentDisposition(key),
            };
            if (options.tags) {
                uploadParams.Tagging = Object.entries(options.tags)
                    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                    .join('&');
            }
            if (fileSize > 5 * 1024 * 1024) {
                const upload = new Upload({
                    client: this.client,
                    params: uploadParams,
                    queueSize: 4,
                    partSize: 5 * 1024 * 1024,
                    leavePartsOnError: false,
                });
                if (onProgress) {
                    upload.on('httpUploadProgress', (progress) => {
                        if (progress.loaded && progress.total) {
                            onProgress((progress.loaded / progress.total) * 100);
                        }
                    });
                }
                const result = await upload.done();
                return {
                    key,
                    bucket: this.bucket,
                    url: this.getPublicUrl(key),
                    etag: result.ETag?.replace(/"/g, '') || '',
                    size: fileSize,
                    contentType: contentType,
                    versionId: result.VersionId,
                };
            }
            else {
                const command = new PutObjectCommand(uploadParams);
                const result = await this.client.send(command);
                return {
                    key,
                    bucket: this.bucket,
                    url: this.getPublicUrl(key),
                    etag: result.ETag?.replace(/"/g, '') || '',
                    size: fileSize,
                    contentType: contentType,
                    versionId: result.VersionId,
                };
            }
        }
        catch (_error) {
            throw new Error(`Failed to upload file: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
        }
    }
    async getPresignedUrl(key, operation = 'get', options = {}) {
        try {
            const command = operation === 'get'
                ? new GetObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    ResponseContentType: options.responseContentType,
                    ResponseContentDisposition: options.responseContentDisposition,
                })
                : new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    ContentType: options.contentType,
                });
            const url = await getSignedUrl(this.client, command, {
                expiresIn: options.expiresIn || this.urlExpiry,
            });
            return url;
        }
        catch (_error) {
            throw new Error(`Failed to generate presigned URL: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
        }
    }
    getPublicUrl(key) {
        if (process.env.CLOUDFRONT_DOMAIN) {
            return `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;
        }
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
    async downloadFile(key) {
        try {
            const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
            const response = await this.client.send(command);
            if (!response.Body)
                throw new Error('No file body returned');
            const stream = response.Body;
            const chunks = [];
            return new Promise((resolve, reject) => {
                stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                stream.on('error', reject);
                stream.on('end', () => resolve(Buffer.concat(chunks)));
            });
        }
        catch (_error) {
            throw new Error(`Failed to download file: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
        }
    }
    async streamFile(key) {
        const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
        const response = await this.client.send(command);
        const body = response.Body;
        if (!body)
            throw new Error('No stream returned from S3');
        return body;
    }
    async deleteFile(key) {
        try {
            const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
            await this.client.send(command);
        }
        catch (_error) {
            throw new Error(`Failed to delete file: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
        }
    }
    async listFiles(prefix, maxKeys = 1000) {
        try {
            const command = new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: maxKeys });
            const response = await this.client.send(command);
            return response.Contents?.map((i) => i.Key) || [];
        }
        catch (_error) {
            throw new Error(`Failed to list files: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
        }
    }
    async copyFile(sourceKey, destinationKey) {
        try {
            const command = new CopyObjectCommand({
                Bucket: this.bucket,
                CopySource: `${this.bucket}/${sourceKey}`,
                Key: destinationKey,
                ServerSideEncryption: 'AES256',
            });
            await this.client.send(command);
        }
        catch (_error) {
            throw new Error(`Failed to copy file: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
        }
    }
    getCacheControl(key) {
        if (key.startsWith('templates/') || key.startsWith('generated-invoices/')) {
            return 'max-age=31536000';
        }
        if (key.includes('/temp/')) {
            return 'no-cache, no-store, must-revalidate';
        }
        return 'max-age=86400';
    }
    getContentDisposition(key) {
        const filename = key.split('/').pop() || 'download';
        const ext = filename.split('.').pop()?.toLowerCase();
        if (key.startsWith('exports/'))
            return `attachment; filename="${filename}"`;
        if (['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(ext || ''))
            return `inline; filename="${filename}"`;
        return `attachment; filename="${filename}"`;
    }
    async cleanupExpiredFiles() {
        try {
            const tempPrefix = 'exports/temp/';
            const files = await this.listFiles(tempPrefix);
            let deletedCount = 0;
            for (const key of files) {
                try {
                    const head = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
                    const resp = await this.client.send(head);
                    const expiresAt = resp.Metadata?.expiresAt;
                    if (expiresAt) {
                        if (new Date(expiresAt) < new Date()) {
                            await this.deleteFile(key);
                            deletedCount++;
                        }
                    }
                    else if (resp.LastModified) {
                        const age = Date.now() - resp.LastModified.getTime();
                        if (age > 48 * 60 * 60 * 1000) {
                            await this.deleteFile(key);
                            deletedCount++;
                        }
                    }
                }
                catch { }
            }
            return deletedCount;
        }
        catch {
            return 0;
        }
    }
}
let s3Service = null;
export function getS3Service() {
    if (!s3Service)
        s3Service = new S3Service();
    return s3Service;
}
export function isValidFileContext(context) {
    if (!context || typeof context !== 'object' || !context.type)
        return false;
    const c = context;
    switch (c.type) {
        case 'transaction':
            return typeof c.transactionId === 'string' && typeof c.documentType === 'string';
        case 'purchase-order':
            return (typeof c.purchaseOrderId === 'string' &&
                ['MANUFACTURING', 'OCEAN', 'WAREHOUSE', 'SHIPPED'].includes(c.stage) &&
                typeof c.documentType === 'string');
        case 'fulfillment-order':
            return (typeof c.fulfillmentOrderId === 'string' &&
                ['PACKING', 'SHIPPING', 'DELIVERY'].includes(c.stage) &&
                typeof c.documentType === 'string');
        case 'warehouse-rate-list':
            return typeof c.warehouseId === 'string';
        case 'export-temp':
            return typeof c.userId === 'string' && typeof c.exportType === 'string';
        case 'export-scheduled':
            return ['daily', 'weekly', 'monthly'].includes(c.frequency) && c.date instanceof Date && typeof c.reportType === 'string';
        case 'template':
            return typeof c.templateType === 'string';
        case 'generated-invoice':
            return typeof c.invoiceId === 'string' && typeof c.invoiceNumber === 'string';
        default:
            return false;
    }
}
