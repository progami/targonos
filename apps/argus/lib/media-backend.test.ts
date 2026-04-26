import test from 'node:test'
import assert from 'node:assert/strict'
import { getArgusMediaS3Key, requireArgusS3MediaConfig } from './media-backend'

function withEnv(values: Record<string, string | undefined>, callback: () => void): void {
  const saved = new Map<string, string | undefined>()

  for (const key of Object.keys(values)) {
    saved.set(key, process.env[key])
    const value = values[key]
    if (value === undefined) {
      delete process.env[key]
      continue
    }

    process.env[key] = value
  }

  try {
    callback()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }

      process.env[key] = value
    }
  }
}

test('S3 media config requires an explicit prefix and bucket in S3 mode', () => {
  withEnv(
    {
      ARGUS_MEDIA_BACKEND: 's3',
      ARGUS_MEDIA_S3_PREFIX: undefined,
      ARGUS_ENV: 'dev',
      S3_BUCKET_NAME: 'wms-development-459288913318',
    },
    () => {
      assert.throws(() => requireArgusS3MediaConfig(), /ARGUS_MEDIA_S3_PREFIX/)
    },
  )

  withEnv(
    {
      ARGUS_MEDIA_BACKEND: 's3',
      ARGUS_MEDIA_S3_PREFIX: 'argus/us/listings/dev',
      S3_BUCKET_NAME: ' ',
    },
    () => {
      assert.throws(() => requireArgusS3MediaConfig(), /S3_BUCKET_NAME/)
    },
  )
})

test('S3 media keys use the explicit Argus listings prefix', () => {
  withEnv(
    {
      ARGUS_MEDIA_BACKEND: 's3',
      ARGUS_MEDIA_S3_PREFIX: '/argus/us/listings/dev/',
      S3_BUCKET_NAME: 'wms-development-459288913318',
    },
    () => {
      requireArgusS3MediaConfig()
      assert.equal(
        getArgusMediaS3Key('media/ab/hash.png'),
        'argus/us/listings/dev/media/ab/hash.png',
      )
    },
  )
})
