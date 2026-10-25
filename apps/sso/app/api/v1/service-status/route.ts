import { NextResponse } from 'next/server'

import { ALL_APPS, getPortalHost, resolveAppUrl } from '@/lib/apps'
import { getSafeServerSession } from '@/lib/safe-session'
import { SEPARATE_HOSTS, type ServiceProbe, type ServiceStatusPayload } from '@/lib/service-map'
import { hasSignedInUser } from '@/lib/session-state'

export const dynamic = 'force-dynamic'

const PROBE_TIMEOUT_MS = 4_000
const CACHE_TTL_MS = 30_000

let cached: { expiresAt: number; payload: ServiceStatusPayload } | undefined

function probeTargets(): Array<{ id: string; url: string }> {
  const workspaceTargets = ALL_APPS
    .filter((app) => app.lifecycle !== 'archive' && app.id !== 'website')
    .map((app) => ({ id: app.id, url: resolveAppUrl(app) }))
  const hostTargets = SEPARATE_HOSTS.filter((host) => host.host !== getPortalHost()).map((host) => ({ id: host.id, url: host.url }))
  return [...workspaceTargets, ...hostTargets]
}

// Same rule as scripts/targonos-host-watchdog.sh: anything below 500 means the process answered.
// Signed-out requests to workspaces redirect to the portal login, which still counts as up.
async function probe(id: string, url: string): Promise<ServiceProbe> {
  const startedAt = performance.now()
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    await response.body?.cancel()
    return {
      id,
      state: response.status < 500 ? 'up' : 'down',
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
    }
  } catch {
    return {
      id,
      state: 'down',
      httpStatus: null,
      latencyMs: Math.round(performance.now() - startedAt),
    }
  }
}

export async function GET() {
  const session = await getSafeServerSession()
  if (!hasSignedInUser(session)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (!cached || cached.expiresAt <= Date.now()) {
    const services = await Promise.all(probeTargets().map((target) => probe(target.id, target.url)))
    cached = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload: { checkedAt: new Date().toISOString(), services },
    }
  }

  return NextResponse.json(cached.payload, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
