'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { cn } from '@/lib/utils'
import { getAllTenants, TenantCode, TenantConfig } from '@/lib/tenant/constants'
import { FlatFlag } from './TenantIndicator'
import { withBasePath } from '@/lib/utils/base-path'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'

interface WorldMapProps {
  className?: string
}

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

const MAP_PROJECTION = 'geoMercator' as const
const MAP_PROJECTION_CONFIG = {
  scale: 148,
  center: [-18, 47],
} as const

const MARKER_COORDINATES: Record<TenantCode, [number, number]> = {
  US: [-118.2437, 34.0522],
  UK: [-0.1276, 51.5074],
}

function formatTimezoneLabel(timezone: string) {
  return timezone.replace('_', ' ').replace('/', ' / ')
}

function PulseRing({ color, active }: { color: string; active: boolean }) {
  return (
    <circle
      r={active ? 18 : 14}
      fill={color}
      opacity={active ? 0.24 : 0.16}
      className="talos-pulse-ring motion-reduce:hidden"
    />
  )
}

function MapFlag({ code }: { code: TenantCode }) {
  if (code === 'US') {
    return (
      <svg x={-9} y={-6} width={18} height={12} viewBox="0 0 24 16" pointerEvents="none">
        <rect width="24" height="16" fill="#B22234" rx="2" />
        <rect y="1.23" width="24" height="1.23" fill="#FFF" />
        <rect y="3.69" width="24" height="1.23" fill="#FFF" />
        <rect y="6.15" width="24" height="1.23" fill="#FFF" />
        <rect y="8.62" width="24" height="1.23" fill="#FFF" />
        <rect y="11.08" width="24" height="1.23" fill="#FFF" />
        <rect y="13.54" width="24" height="1.23" fill="#FFF" />
        <rect width="9.6" height="8.62" fill="#3C3B6E" rx="2" />
      </svg>
    )
  }

  return (
    <svg x={-9} y={-6} width={18} height={12} viewBox="0 0 24 16" pointerEvents="none">
      <rect width="24" height="16" fill="#012169" rx="2" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFF" strokeWidth="2.5" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#C8102E" strokeWidth="1.5" />
      <path d="M12,0 V16 M0,8 H24" stroke="#FFF" strokeWidth="4" />
      <path d="M12,0 V16 M0,8 H24" stroke="#C8102E" strokeWidth="2.5" />
    </svg>
  )
}

const WorldBaseMap = memo(function WorldBaseMap() {
  return (
    <ComposableMap
      projection={MAP_PROJECTION}
      projectionConfig={MAP_PROJECTION_CONFIG}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map(geo => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="#334155"
              stroke="#475569"
              strokeWidth={0.5}
              style={{ default: { outline: 'none' } }}
            />
          ))
        }
      </Geographies>
    </ComposableMap>
  )
})

const WorldMarkerLayer = memo(function WorldMarkerLayer({
  tenants,
  selectedTenantCode,
}: {
  tenants: TenantConfig[]
  selectedTenantCode: TenantCode | null
}) {
  return (
    <ComposableMap
      projection={MAP_PROJECTION}
      projectionConfig={MAP_PROJECTION_CONFIG}
      style={{ width: '100%', height: '100%' }}
      aria-label="Region selection map"
    >
      {tenants.map(tenant => {
        const coords = MARKER_COORDINATES[tenant.code]
        const isSelected = tenant.code === selectedTenantCode

        return (
          <Marker key={tenant.code} coordinates={coords}>
            <g>
              <PulseRing color={tenant.color} active={isSelected} />
              <circle
                r={isSelected ? 24 : 18}
                fill={tenant.color}
                opacity={isSelected ? 0.18 : 0.1}
              />
              <circle
                r={isSelected ? 13 : 10}
                fill="#020617"
                stroke={tenant.color}
                strokeWidth={isSelected ? 2.5 : 2}
              />
              <MapFlag code={tenant.code} />
            </g>
          </Marker>
        )
      })}
    </ComposableMap>
  )
})

export function WorldMap({ className }: WorldMapProps) {
  const router = useRouter()
  const [selecting, setSelecting] = useState<TenantCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessibleRegions, setAccessibleRegions] = useState<TenantCode[]>([])
  const [loading, setLoading] = useState(true)
  const tenants = useMemo(() => getAllTenants(), [])

  useEffect(() => {
    async function fetchAccessibleRegions() {
      try {
        const response = await fetch(withBasePath('/api/tenant/current'), {
          credentials: 'include',
        })
        if (!response.ok) {
          return
        }

        const data = await response.json()
        if (Array.isArray(data.available) && data.available.length > 0) {
          setAccessibleRegions(data.available.map((tenant: { code: TenantCode }) => tenant.code))
        }
      } catch {
        // If not authenticated, the select endpoint will reject unauthorized access.
      } finally {
        setLoading(false)
      }
    }

    fetchAccessibleRegions()
  }, [])

  const canAccessTenant = useCallback(
    (code: TenantCode): boolean => {
      if (loading || accessibleRegions.length === 0) return true
      return accessibleRegions.includes(code)
    },
    [accessibleRegions, loading]
  )

  const handleSelectTenant = useCallback(
    async (tenant: TenantConfig) => {
      if (!canAccessTenant(tenant.code)) {
        setError(`You don't have access to the ${tenant.displayName} region`)
        return
      }

      if (selecting !== null) return

      setSelecting(tenant.code)
      setError(null)

      try {
        const response = await fetchWithCSRF('/api/tenant/select', {
          method: 'POST',
          body: JSON.stringify({ tenant: tenant.code }),
        })

        if (!response.ok) {
          const data = await response.json()

          if (typeof data.error === 'string' && data.error.length > 0) {
            throw new Error(data.error)
          }

          throw new Error('Failed to select region')
        }

        router.push('/dashboard')
        router.refresh()
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Failed to select region')
        }

        setSelecting(null)
      }
    },
    [canAccessTenant, router, selecting]
  )

  return (
    <div className={cn('relative isolate min-h-screen overflow-hidden bg-[#020817]', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_50%,#000_40%,transparent_100%)]"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute left-1/4 top-1/4 h-[48rem] w-[48rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18)_0%,transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-1/4 top-1/4 h-[48rem] w-[48rem] translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16)_0%,transparent_65%)]"
      />

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto flex w-full max-w-6xl shrink-0 flex-col items-center gap-3 text-center">
          <div className="max-w-3xl space-y-2">
            <h1 className="text-4xl font-semibold uppercase tracking-[0.18em] text-white sm:text-5xl lg:text-6xl">
              Talos
            </h1>
            <p className="text-base font-medium tracking-[0.08em] text-slate-300 sm:text-lg">
              Warehouse Management System.
            </p>
            <p className="text-sm font-medium tracking-[0.06em] text-slate-400 sm:text-base">
              Select your region
            </p>
          </div>
        </div>

        <div className="mx-auto mt-5 flex w-full max-w-6xl flex-1 flex-col justify-start gap-3 sm:mt-6 sm:gap-4">
          <div className="relative min-h-[460px] overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(2,6,23,0.72),rgba(2,6,23,0.92))] shadow-[0_40px_120px_rgba(2,6,23,0.65)] sm:min-h-[560px] lg:min-h-[660px]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_78%_22%,rgba(16,185,129,0.16),transparent_34%)]"
            />

            <div className="absolute inset-0 [contain:paint]">
              <WorldBaseMap />
            </div>

            <div className="absolute inset-0 transform-gpu">
              <WorldMarkerLayer tenants={tenants} selectedTenantCode={selecting} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {tenants.map(tenant => {
              const hasAccess = canAccessTenant(tenant.code)
              const isBusy = selecting === tenant.code

              return (
                <button
                  key={tenant.code}
                  type="button"
                  onClick={() => handleSelectTenant(tenant)}
                  disabled={selecting !== null}
                  className={cn(
                    'rounded-[26px] border p-4 text-left transition-all duration-300 sm:p-5',
                    'focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-[#020817]',
                    'bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]',
                    hasAccess && 'hover:-translate-y-1',
                    !hasAccess && 'cursor-not-allowed opacity-45',
                    'border-white/10'
                  )}
                  style={{
                    boxShadow: isBusy
                      ? `0 0 0 1px ${tenant.color}, 0 32px 80px rgba(2, 6, 23, 0.62)`
                      : '0 24px 60px rgba(2, 6, 23, 0.4)',
                  }}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5">
                      <FlatFlag code={tenant.code} size={32} />
                    </div>

                    <div
                      className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                      style={{
                        backgroundColor: isBusy ? `${tenant.color}1f` : 'rgba(255,255,255,0.06)',
                        color: isBusy ? tenant.color : hasAccess ? '#94a3b8' : '#64748b',
                      }}
                    >
                      {isBusy ? 'Opening' : hasAccess ? 'Available' : 'No Access'}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold tracking-[-0.04em] text-white">
                        {tenant.displayName}
                      </span>
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {tenant.currency}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-200">{tenant.name}</p>
                    <p className="max-w-[18ch] text-xs leading-5 text-slate-400">
                      {formatTimezoneLabel(tenant.timezone)}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs font-medium text-slate-400">
                    <span>{isBusy ? 'Loading region' : 'Enter region'}</span>
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm"
                      style={{ color: isBusy ? tenant.color : '#cbd5e1' }}
                    >
                      {isBusy ? (
                        <svg
                          className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-3.5 w-3.5 transition-transform"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 12h14m-5-5 5 5-5 5"
                          />
                        </svg>
                      )}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {error && (
            <div className="mx-auto mt-4 w-full max-w-3xl rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
