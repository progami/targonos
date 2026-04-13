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

export function compareTopology(input) {
  if (input.buildPublicAppUrl !== input.runtimePublicAppUrl) {
    return {
      ok: false,
      message: `Topology mismatch: buildPublicAppUrl=${input.buildPublicAppUrl} runtimePublicAppUrl=${input.runtimePublicAppUrl}`,
    }
  }

  if (!input.runtimePublicAppUrl.startsWith(input.expectedPortalOrigin)) {
    return {
      ok: false,
      message: `Topology mismatch: runtimePublicAppUrl=${input.runtimePublicAppUrl} expectedPortalOrigin=${input.expectedPortalOrigin}`,
    }
  }

  return { ok: true, message: 'ok' }
}

export function assertTopologyFromEnv() {
  const result = compareTopology({
    expectedPortalOrigin: requireEnv('EXPECTED_PORTAL_ORIGIN'),
    buildPublicAppUrl: requireEnv('BUILD_PUBLIC_APP_URL'),
    runtimePublicAppUrl: requireEnv('RUNTIME_PUBLIC_APP_URL'),
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
