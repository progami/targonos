import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const requireFromTest = createRequire(import.meta.url)
const configPath = path.resolve(__dirname, '..', '..', 'next.config.js')
const resolvedConfigPath = requireFromTest.resolve(configPath)

function setEnv(name: string, value: string): void {
  Reflect.set(process.env, name, value)
}

function deleteEnv(name: string): void {
  Reflect.deleteProperty(process.env, name)
}

async function readStaticAssetCacheControl(nodeEnv: string): Promise<string> {
  const previousNodeEnv = process.env.NODE_ENV
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL

  setEnv('NODE_ENV', nodeEnv)
  setEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:41101/talos')
  delete requireFromTest.cache[resolvedConfigPath]

  try {
    const config = requireFromTest(configPath)
    const headers = await config.headers()
    const staticRoute = headers.find((entry: { source: string }) => entry.source === '/_next/static/:path*')

    assert.ok(staticRoute)

    const cacheHeader = staticRoute.headers.find(
      (header: { key: string }) => header.key === 'Cache-Control'
    )

    assert.ok(cacheHeader)

    return cacheHeader.value
  } finally {
    delete requireFromTest.cache[resolvedConfigPath]

    if (typeof previousNodeEnv === 'string') {
      setEnv('NODE_ENV', previousNodeEnv)
    } else {
      deleteEnv('NODE_ENV')
    }

    if (typeof previousAppUrl === 'string') {
      setEnv('NEXT_PUBLIC_APP_URL', previousAppUrl)
    } else {
      deleteEnv('NEXT_PUBLIC_APP_URL')
    }
  }
}

test('development static chunks are not cached immutably', async () => {
  assert.equal(
    await readStaticAssetCacheControl('development'),
    'no-store, no-cache, must-revalidate'
  )
})

test('production static chunks keep immutable caching', async () => {
  assert.equal(
    await readStaticAssetCacheControl('production'),
    'public, max-age=31536000, immutable'
  )
})
