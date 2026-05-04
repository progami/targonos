import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { buildLocalMediaUpload } from './s3-media-migration'

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

test('buildLocalMediaUpload keeps the DB file path and derives the matching S3 key', () => {
  withEnv(
    {
      ARGUS_MEDIA_BACKEND: 's3',
      ARGUS_MEDIA_S3_PREFIX: 'argus/us/listings/dev',
      S3_BUCKET_NAME: 'wms-development-459288913318',
    },
    () => {
      assert.deepEqual(
        buildLocalMediaUpload('/app', {
          id: 'media_1',
          filePath: 'media/ab/hash.png',
          mimeType: 'image/png',
          bytes: 123,
        }),
        {
          id: 'media_1',
          filePath: 'media/ab/hash.png',
          absolutePath: path.join('/app', 'public', 'media', 'ab', 'hash.png'),
          s3Bucket: 'wms-development-459288913318',
          s3Key: 'argus/us/listings/dev/media/ab/hash.png',
          contentType: 'image/png',
          bytes: 123,
        },
      )
    },
  )
})

test('buildLocalMediaUpload rejects non-media DB file paths', () => {
  withEnv(
    {
      ARGUS_MEDIA_BACKEND: 's3',
      ARGUS_MEDIA_S3_PREFIX: 'argus/us/listings/dev',
      S3_BUCKET_NAME: 'wms-development-459288913318',
    },
    () => {
      assert.throws(
        () =>
          buildLocalMediaUpload('/app', {
            id: 'media_2',
            filePath: '../secret.png',
            mimeType: 'image/png',
            bytes: 123,
          }),
        /Invalid media filePath/,
      )
    },
  )
})
