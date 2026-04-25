export type ArgusMarket = 'us' | 'uk'

export type ArgusMarketOption = {
  slug: ArgusMarket
  label: string
}

export type ArgusMarketConfig = ArgusMarketOption & {
  salesRoot: string
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
  const salesRoot = requireEnv(`ARGUS_SALES_ROOT_${envSuffix}`)
  const wprDataDir = requireEnv(`WPR_DATA_DIR_${envSuffix}`)
  const normalizedSalesRoot = stripTrailingSlash(salesRoot)

  return {
    slug: option.slug,
    label: option.label,
    salesRoot: normalizedSalesRoot,
    monitoringRoot: joinPath(normalizedSalesRoot, 'Monitoring'),
    wprRoot: joinPath(normalizedSalesRoot, 'WPR'),
    wprDataDir: stripTrailingSlash(wprDataDir),
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

function joinPath(root: string, child: string): string {
  return `${stripTrailingSlash(root)}/${child}`
}
