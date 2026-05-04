import type { WprPayload } from './types'

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`)
  }
}

function assertKey(record: Record<string, unknown>, key: string, path: string) {
  if (!(key in record)) {
    throw new Error(`${path}.${key} is required`)
  }
}

const TOP_LEVEL_KEYS = [
  'defaultWeek',
  'meta',
  'weeks',
  'weekStartDates',
  'clusters',
  'scatterClusterIds',
  'lineClusterIds',
  'shareClusterIds',
  'ppcClusterIds',
  'defaultClusterIds',
  'sqpTerms',
  'sqpClusterTerms',
  'sqpGlobalTermIds',
  'regression',
  'brandMetrics',
  'competitorWeekly',
  'scp',
  'businessReports',
  'sourceOverview',
  'windowsByWeek',
  'changeLogByWeek',
  'audit',
] as const

const WEEK_BUNDLE_KEYS = [
  'meta',
  'weeks',
  'clusters',
  'scatterClusterIds',
  'lineClusterIds',
  'shareClusterIds',
  'ppcClusterIds',
  'defaultClusterIds',
  'sqpTerms',
  'sqpClusterTerms',
  'sqpGlobalTermIds',
  'regression',
  'brandMetricsWindow',
  'brandMetrics',
  'competitorWeekly',
  'scp',
  'businessReports',
] as const

export function assertWprPayloadContract(payload: unknown): asserts payload is WprPayload {
  assertRecord(payload, 'payload')
  for (const key of TOP_LEVEL_KEYS) {
    assertKey(payload, key, 'payload')
  }

  assertString(payload.defaultWeek, 'payload.defaultWeek')
  assertRecord(payload.windowsByWeek, 'payload.windowsByWeek')

  const windowsByWeek = payload.windowsByWeek as Record<string, unknown>
  const defaultBundle = windowsByWeek[payload.defaultWeek]
  if (defaultBundle === undefined) {
    throw new Error(`payload.windowsByWeek.${payload.defaultWeek} is required`)
  }

  for (const [weekLabel, weekBundle] of Object.entries(windowsByWeek)) {
    assertRecord(weekBundle, `payload.windowsByWeek.${weekLabel}`)
    for (const key of WEEK_BUNDLE_KEYS) {
      assertKey(weekBundle, key, `payload.windowsByWeek.${weekLabel}`)
    }
  }
}
