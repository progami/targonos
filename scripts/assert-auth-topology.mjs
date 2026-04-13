function requireEnv(name) {
  const value = process.env[name]
  if (typeof value !== 'string') {
    throw new Error(`${name} must be defined for auth topology assertions.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${name} must be defined for auth topology assertions.`)
  }

  return trimmed
}

function parseUrl(raw, fieldName) {
  try {
    return new URL(raw)
  } catch {
    throw new Error(`${fieldName} must be a valid absolute URL.`)
  }
}

function normalizeUrl(raw, fieldName) {
  const url = parseUrl(raw, fieldName)

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, '')
  }

  url.hash = ''

  return url
}

export function compareTopology(input) {
  const buildPublicUrl = normalizeUrl(input.buildPublicUrl, 'buildPublicUrl')
  const runtimePublicUrl = normalizeUrl(input.runtimePublicUrl, 'runtimePublicUrl')
  const expectedPortalOrigin = normalizeUrl(input.expectedPortalOrigin, 'expectedPortalOrigin')

  if (buildPublicUrl.href !== runtimePublicUrl.href) {
    return {
      ok: false,
      message: `Topology mismatch: buildPublicUrl=${buildPublicUrl.href} runtimePublicUrl=${runtimePublicUrl.href}`,
    }
  }

  if (runtimePublicUrl.origin !== expectedPortalOrigin.origin) {
    return {
      ok: false,
      message: `Topology mismatch: runtimePublicUrl=${runtimePublicUrl.href} expectedPortalOrigin=${expectedPortalOrigin.href}`,
    }
  }

  return { ok: true, message: 'ok' }
}

export function assertTopologyFromEnv() {
  const result = compareTopology({
    expectedPortalOrigin: requireEnv('EXPECTED_PORTAL_ORIGIN'),
    buildPublicUrl: requireEnv('BUILD_PUBLIC_URL'),
    runtimePublicUrl: requireEnv('RUNTIME_PUBLIC_URL'),
  })

  if (!result.ok) {
    throw new Error(result.message)
  }

  return result
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = assertTopologyFromEnv()
  process.stdout.write(`${result.message}\n`)
}
