import { S3Service } from '@targon/aws-s3';

type GlobalWithS3 = typeof globalThis & {
  __argusS3?: S3Service;
};

const globalForS3 = globalThis as GlobalWithS3;

export const s3 = globalForS3.__argusS3 ?? new S3Service();

if (process.env.NODE_ENV !== 'production') {
  globalForS3.__argusS3 = s3;
}

