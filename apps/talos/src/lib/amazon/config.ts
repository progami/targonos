import type { TenantCode } from '@/lib/tenant/constants'

export type SellingPartnerApiRegion = 'eu' | 'na' | 'fe'

export type AmazonSpApiConfig = {
  region: SellingPartnerApiRegion
  refreshToken: string
  marketplaceId: string
  appClientId: string
  appClientSecret: string
  sellerId?: string
}

type EnvReader = (name: string) => string | undefined

type AmazonSpApiConfigEnvOptions = {
  nodeEnv?: string
  readEnv?: EnvReader
}

type AmazonSpApiConfigEnvNames = {
  appClientId: string
  appClientSecret: string
  refreshToken: string
  marketplaceId: string
  region: string
  sellerId: string
}

const TENANT_CODES: TenantCode[] = ['US', 'UK']

const SP_API_CREDENTIAL_KEYS = [
  'AMAZON_SP_APP_CLIENT_ID',
  'AMAZON_SP_APP_CLIENT_SECRET',
  'AMAZON_REFRESH_TOKEN',
] as const

function readProcessEnv(name: string): string | undefined {
  return process.env[name]
}

function readEnvVar(readEnv: EnvReader, name: string): string | undefined {
  const value = readEnv(name)
  if (!value) return undefined

  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined

  return trimmed
}

function normalizeRegion(value: string): SellingPartnerApiRegion | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'eu') return normalized
  if (normalized === 'na') return normalized
  if (normalized === 'fe') return normalized

  return null
}

function getConfigEnvNames(tenantCode?: TenantCode): AmazonSpApiConfigEnvNames {
  if (tenantCode) {
    return {
      appClientId: `AMAZON_SP_APP_CLIENT_ID_${tenantCode}`,
      appClientSecret: `AMAZON_SP_APP_CLIENT_SECRET_${tenantCode}`,
      refreshToken: `AMAZON_REFRESH_TOKEN_${tenantCode}`,
      marketplaceId: `AMAZON_MARKETPLACE_ID_${tenantCode}`,
      region: `AMAZON_SP_API_REGION_${tenantCode}`,
      sellerId: `AMAZON_SELLER_ID_${tenantCode}`,
    }
  }

  return {
    appClientId: 'AMAZON_SP_APP_CLIENT_ID',
    appClientSecret: 'AMAZON_SP_APP_CLIENT_SECRET',
    refreshToken: 'AMAZON_REFRESH_TOKEN',
    marketplaceId: 'AMAZON_MARKETPLACE_ID',
    region: 'AMAZON_SP_API_REGION',
    sellerId: 'AMAZON_SELLER_ID',
  }
}

function hasAnySpApiCredentialEnv(readEnv: EnvReader): boolean {
  for (const key of SP_API_CREDENTIAL_KEYS) {
    if (readEnvVar(readEnv, key)) return true

    for (const tenantCode of TENANT_CODES) {
      if (readEnvVar(readEnv, `${key}_${tenantCode}`)) return true
    }
  }

  return false
}

function readRequiredEnvVar(
  readEnv: EnvReader,
  name: string,
  missing: string[]
): string {
  const value = readEnvVar(readEnv, name)
  if (value) return value

  missing.push(name)
  return ''
}

function getMissingConfigError(missing: string[]): Error {
  return new Error(`Amazon SP-API not configured. Missing env vars: ${missing.join(', ')}`)
}

export function isAmazonSpApiConfigurationError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false

  return error.message.startsWith('Amazon SP-API not configured.')
}

export function getAmazonSpApiConfigFromEnv(
  tenantCode?: TenantCode,
  options?: AmazonSpApiConfigEnvOptions
): AmazonSpApiConfig | null {
  const readEnv = options?.readEnv ? options.readEnv : readProcessEnv
  const nodeEnv = options?.nodeEnv ? options.nodeEnv : process.env.NODE_ENV
  const names = getConfigEnvNames(tenantCode)

  if (!hasAnySpApiCredentialEnv(readEnv)) {
    if (nodeEnv === 'production') {
      throw getMissingConfigError([
        names.appClientId,
        names.appClientSecret,
        names.refreshToken,
      ])
    }

    return null
  }

  const missing: string[] = []
  const appClientId = readRequiredEnvVar(readEnv, names.appClientId, missing)
  const appClientSecret = readRequiredEnvVar(readEnv, names.appClientSecret, missing)
  const refreshToken = readRequiredEnvVar(readEnv, names.refreshToken, missing)
  const marketplaceId = readRequiredEnvVar(readEnv, names.marketplaceId, missing)
  const regionRaw = readRequiredEnvVar(readEnv, names.region, missing)

  if (missing.length > 0) {
    throw getMissingConfigError(missing)
  }

  const region = normalizeRegion(regionRaw)
  if (!region) {
    throw new Error(`Invalid ${names.region} value "${regionRaw}". Expected one of: eu, na, fe.`)
  }

  const sellerId = readEnvVar(readEnv, names.sellerId)

  return {
    region,
    refreshToken,
    marketplaceId,
    appClientId,
    appClientSecret,
    sellerId: sellerId ? sellerId : undefined,
  }
}
