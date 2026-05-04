import test from 'node:test'
import assert from 'node:assert/strict'

import { S3Service } from './index'

const ORIGINAL_ENV = { ...process.env }

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

function bucketOf(service: S3Service): string {
  return (service as unknown as { bucket: string }).bucket
}

test.afterEach(() => {
  resetEnv()
})

test('uses the development warehouse bucket by default outside production', () => {
  resetEnv()
  process.env.NODE_ENV = 'development'
  delete process.env.S3_BUCKET_NAME
  delete process.env.AWS_REGION
  delete process.env.S3_BUCKET_REGION

  const service = new S3Service()

  assert.equal(bucketOf(service), 'wms-development-459288913318')
})

test('uses the production warehouse bucket by default in production', () => {
  resetEnv()
  process.env.NODE_ENV = 'production'
  delete process.env.S3_BUCKET_NAME
  delete process.env.AWS_REGION
  delete process.env.S3_BUCKET_REGION

  const service = new S3Service()

  assert.equal(bucketOf(service), 'wms-production-459288913318')
})

test('prefers an explicit S3 bucket env over the default bucket', () => {
  resetEnv()
  process.env.NODE_ENV = 'development'
  process.env.S3_BUCKET_NAME = 'custom-bucket'

  const service = new S3Service()

  assert.equal(bucketOf(service), 'custom-bucket')
})
