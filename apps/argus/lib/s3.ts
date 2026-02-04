import { S3Service } from '@targon/aws-s3';

type GlobalWithS3 = typeof globalThis & {
  __argusS3?: S3Service;
};

const globalForS3 = globalThis as GlobalWithS3;

export function getS3(): S3Service {
  if (!globalForS3.__argusS3) {
    globalForS3.__argusS3 = new S3Service();
  }
  return globalForS3.__argusS3;
}
