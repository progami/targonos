import { KNOWN_ASIN_LABELS } from '@/lib/product-labels'

export type TrackingSeedOwnership = 'OURS' | 'COMPETITOR'

export interface TrackingAsinSeed {
  asin: string
  ownership: TrackingSeedOwnership
  label: string
}

type TrackingSeedEnv = Record<string, string | undefined>

function normalizeAsin(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(normalized)) {
    throw new Error(`Invalid ASIN: ${value}`)
  }
  return normalized
}

function readRequiredMarketEnv(env: TrackingSeedEnv, baseName: string, market: 'us' | 'uk'): string {
  const key = `${baseName}_${market.toUpperCase()}`
  const value = env[key]
  if (typeof value !== 'string') {
    throw new Error(`Missing required ASIN list env var: ${key}`)
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`Missing required ASIN list env var: ${key}`)
  }

  return trimmed
}

function parseAsinList(raw: string): string[] {
  const asins = raw
    .split(/[\s,|]+/)
    .map((asin) => asin.trim())
    .filter((asin) => asin.length > 0)
    .map(normalizeAsin)

  if (asins.length === 0) {
    throw new Error('ASIN list is empty after parsing.')
  }

  return asins
}

function labelForAsin(asin: string): string {
  const knownLabel = KNOWN_ASIN_LABELS[asin]
  if (typeof knownLabel === 'string' && knownLabel.trim().length > 0) {
    return knownLabel.trim()
  }

  return asin
}

export function normalizeTrackingAsinSeeds(rawSeeds: unknown): TrackingAsinSeed[] {
  if (!Array.isArray(rawSeeds)) return []

  const seeds: TrackingAsinSeed[] = []
  const seen = new Set<string>()

  for (const item of rawSeeds) {
    if (item === null || typeof item !== 'object') {
      throw new Error('Tracked ASIN seed must be an object.')
    }

    const seed = item as { asin?: unknown; ownership?: unknown; label?: unknown }
    if (typeof seed.asin !== 'string') {
      throw new Error('Tracked ASIN seed is missing asin.')
    }
    if (seed.ownership !== 'OURS' && seed.ownership !== 'COMPETITOR') {
      throw new Error(`Tracked ASIN seed has invalid ownership for ${seed.asin}.`)
    }
    if (typeof seed.label !== 'string' || seed.label.trim().length === 0) {
      throw new Error(`Tracked ASIN seed is missing label for ${seed.asin}.`)
    }

    const asin = normalizeAsin(seed.asin)
    if (seen.has(asin)) {
      throw new Error(`Duplicate tracked ASIN seed: ${asin}`)
    }

    seen.add(asin)
    seeds.push({
      asin,
      ownership: seed.ownership,
      label: seed.label.trim(),
    })
  }

  return seeds
}

export function buildTrackingAsinSeedsFromEnv(env: TrackingSeedEnv, market: 'us' | 'uk'): TrackingAsinSeed[] {
  const ours = parseAsinList(readRequiredMarketEnv(env, 'ARGUS_OUR_ASINS', market)).map((asin) => ({
    asin,
    ownership: 'OURS' as const,
    label: labelForAsin(asin),
  }))
  const competitors = parseAsinList(readRequiredMarketEnv(env, 'ARGUS_COMPETITOR_MAIN_ASINS', market)).map((asin) => ({
    asin,
    ownership: 'COMPETITOR' as const,
    label: labelForAsin(asin),
  }))

  return normalizeTrackingAsinSeeds([...ours, ...competitors])
}
