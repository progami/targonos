export type ArgusMarket = 'us' | 'uk'

export type ArgusMarketOption = {
  slug: ArgusMarket
  label: string
}

export type ArgusMarketConfig = ArgusMarketOption & {
  monitoringRoot: string
  wprRoot: string
  wprDataDir: string
}

export const DEFAULT_ARGUS_MARKET: ArgusMarket = 'us'

export const ARGUS_MARKETS: ArgusMarketOption[] = [
  { slug: 'us', label: 'US' },
  { slug: 'uk', label: 'UK' },
]

export function parseArgusMarket(value: string | null | undefined): ArgusMarket {
  if (value === undefined) {
    return DEFAULT_ARGUS_MARKET
  }

  if (value === null) {
    return DEFAULT_ARGUS_MARKET
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '') {
    return DEFAULT_ARGUS_MARKET
  }

  if (normalized === 'us') {
    return 'us'
  }

  if (normalized === 'uk') {
    return 'uk'
  }

  throw new Error(`Unsupported Argus market: ${value}`)
}

export function getArgusMarketOption(market: ArgusMarket): ArgusMarketOption {
  const option = ARGUS_MARKETS.find((entry) => entry.slug === market)
  if (option === undefined) {
    throw new Error(`Unsupported Argus market: ${market}`)
  }

  return option
}

export function getArgusMarketConfig(market: ArgusMarket): ArgusMarketConfig {
  const option = getArgusMarketOption(market)
  const envSuffix = market.toUpperCase()
  const monitoringRoot = requireEnv(`ARGUS_MONITORING_ROOT_${envSuffix}`)
  const wprDataDir = requireEnv(`WPR_DATA_DIR_${envSuffix}`)
  const normalizedMonitoringRoot = expectLocalRoot(
    `ARGUS_MONITORING_ROOT_${envSuffix}`,
    stripTrailingSlash(monitoringRoot),
  )
  const normalizedWprDataDir = expectLocalRoot(`WPR_DATA_DIR_${envSuffix}`, stripTrailingSlash(wprDataDir))

  return {
    slug: option.slug,
    label: option.label,
    monitoringRoot: normalizedMonitoringRoot,
    wprRoot: parentPath(parentPath(normalizedWprDataDir)),
    wprDataDir: normalizedWprDataDir,
  }
}

export function appendMarketParam(path: string, market: ArgusMarket): string {
  if (market === DEFAULT_ARGUS_MARKET) {
    return path
  }

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}market=${market}`
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined) {
    throw new Error(`${name} is required for Argus.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${name} is required for Argus.`)
  }

  return trimmed
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '')
}

function parentPath(value: string): string {
  const normalized = stripTrailingSlash(value)
  const separator = normalized.lastIndexOf('/')
  if (separator <= 0) {
    throw new Error(`Cannot resolve parent path for Argus path: ${value}`)
  }
  return normalized.slice(0, separator)
}

function expectLocalRoot(name: string, value: string): string {
  if (value.includes('/Library/CloudStorage/')) {
    throw new Error(`${name} must be local, not a Google Drive mount.`)
  }
  return value
}
