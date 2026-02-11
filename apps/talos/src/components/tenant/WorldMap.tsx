'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps'
import { cn } from '@/lib/utils'
import { getAllTenants, TenantCode, TenantConfig } from '@/lib/tenant/constants'
import { FlatFlag } from './TenantIndicator'
import { withBasePath } from '@/lib/utils/base-path'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'

interface WorldMapProps {
  className?: string
}

// Natural Earth topojson - reliable CDN source
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

// Geographic coordinates for markers
const MARKER_COORDINATES: Record<string, [number, number]> = {
  US: [-118.2437, 34.0522], // Los Angeles
  UK: [-0.1276, 51.5074], // London
}

export function WorldMap({ className }: WorldMapProps) {
  const router = useRouter()
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessibleRegions, setAccessibleRegions] = useState<TenantCode[]>([])
  const [loading, setLoading] = useState(true)
  const tenants = getAllTenants()

  // Fetch user's accessible regions on mount
  useEffect(() => {
    async function fetchAccessibleRegions() {
      try {
        const response = await fetch(withBasePath('/api/tenant/current'), { credentials: 'include' })
        if (response.ok) {
          const data = await response.json()
          // Store ALL accessible regions
          if (data.available && data.available.length > 0) {
            setAccessibleRegions(data.available.map((t: { code: string }) => t.code as TenantCode))
          }
        }
      } catch {
        // If not authenticated, all regions shown but will fail on select
      } finally {
        setLoading(false)
      }
    }
    fetchAccessibleRegions()
  }, [])

  const canAccessTenant = (code: string): boolean => {
    // If still loading or no regions fetched, allow click (API will reject if unauthorized)
    if (loading || accessibleRegions.length === 0) return true
    return accessibleRegions.includes(code as TenantCode)
  }

  const handleSelectTenant = async (tenant: TenantConfig) => {
    if (!canAccessTenant(tenant.code)) {
      setError(`You don't have access to the ${tenant.displayName} region`)
      return
    }

    setSelecting(tenant.code)
    setError(null)

    try {
      const response = await fetchWithCSRF('/api/tenant/select', {
        method: 'POST',
        body: JSON.stringify({ tenant: tenant.code }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to select region')
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select region')
      setSelecting(null)
    }
  }

  return (
    <div className={cn('relative h-screen bg-slate-950 overflow-hidden', className)}>
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_50%,#000_40%,transparent_100%)]" />

      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]" />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-between h-full px-4 py-4 lg:py-6">
        {/* Header */}
        <div className="text-center shrink-0">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-1 tracking-tight">
            Talos
          </h1>
          <p className="text-base lg:text-lg text-slate-400">
            Select your region to continue
          </p>
        </div>

        {/* World Map - flex-1 to take available space */}
        <div className="relative w-full max-w-3xl lg:max-w-4xl flex-1 min-h-0 flex items-center">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 120,
              center: [-20, 40],
            }}
            style={{ width: '100%', height: '100%' }}
          >
            {/* Countries */}
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#334155"
                    stroke="#475569"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: '#475569' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Region markers */}
            {tenants.map((tenant) => {
              const coords = MARKER_COORDINATES[tenant.code]
              if (!coords) return null

              return (
                <Marker key={tenant.code} coordinates={coords}>
                  <g
                    onClick={() => handleSelectTenant(tenant)}
                    style={{ cursor: 'pointer' }}
                    className="group"
                  >
                    {/* Outer pulse ring */}
                    <circle
                      r={20}
                      fill={tenant.color}
                      opacity={0.2}
                      className="animate-ping"
                    />
                    {/* Inner glow */}
                    <circle
                      r={16}
                      fill={tenant.color}
                      opacity={0.3}
                    />
                    {/* Main circle */}
                    <circle
                      r={12}
                      fill="#0f172a"
                      stroke={tenant.color}
                      strokeWidth={2}
                    />
                    {/* Flag */}
                    <foreignObject x={-9} y={-6} width={18} height={12} style={{ pointerEvents: 'none' }}>
                      <FlatFlag code={tenant.code} size={18} />
                    </foreignObject>
                  </g>
                </Marker>
              )
            })}
          </ComposableMap>

          {/* Floating labels for markers */}
          {tenants.map((tenant) => {
            const coords = MARKER_COORDINATES[tenant.code]
            if (!coords) return null

            // Approximate screen position based on projection
            const isUS = tenant.code === 'US'
            const leftPos = isUS ? '22%' : '52%'
            const topPos = isUS ? '38%' : '28%'

            return (
              <button
                key={`label-${tenant.code}`}
                onClick={() => handleSelectTenant(tenant)}
                disabled={selecting !== null}
                className={cn(
                  'absolute transform -translate-x-1/2 translate-y-8 text-center',
                  'transition-all duration-200 hover:scale-105',
                  selecting === tenant.code && 'animate-pulse'
                )}
                style={{ left: leftPos, top: topPos }}
              >
                <div className="text-sm font-semibold text-white">{tenant.displayName}</div>
                <div className="text-xs text-slate-400">{tenant.timezone.replace('_', ' ')}</div>
              </button>
            )
          })}
        </div>

        {/* Region cards */}
        <div className="shrink-0 grid grid-cols-2 gap-3 lg:gap-4 w-full max-w-xl lg:max-w-2xl">
          {tenants.map((tenant) => {
            const hasAccess = canAccessTenant(tenant.code)
            const isDisabled = selecting !== null || !hasAccess

            return (
            <button
              key={tenant.code}
              onClick={() => handleSelectTenant(tenant)}
              disabled={isDisabled}
              className={cn(
                'group relative overflow-hidden rounded-xl p-3 lg:p-4 text-left transition-all duration-300',
                'bg-slate-900/50 border border-slate-800',
                hasAccess && 'hover:bg-slate-900 hover:border-slate-700 hover:shadow-2xl hover:shadow-slate-900/50',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950',
                selecting === tenant.code && 'ring-2',
                !hasAccess && 'opacity-40 cursor-not-allowed',
                selecting !== null && selecting !== tenant.code && 'opacity-50'
              )}
              style={{
                ['--ring-color' as string]: tenant.color,
              }}
            >
              {/* Gradient accent */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity"
                style={{
                  background: `linear-gradient(135deg, ${tenant.color} 0%, transparent 60%)`,
                }}
              />

              <div className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <FlatFlag code={tenant.code} size={32} />
                  <div>
                    <h3 className="text-base lg:text-lg font-semibold text-white">
                      {tenant.displayName}
                    </h3>
                    <p className="text-xs lg:text-sm text-slate-400">{tenant.name}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs lg:text-sm text-slate-400">
                  <span>{tenant.timezone.replace('_', ' ')}</span>
                  <span
                    className="flex items-center gap-1.5 font-medium transition-colors group-hover:text-white"
                    style={{ color: selecting === tenant.code ? tenant.color : undefined }}
                  >
                    {selecting === tenant.code ? (
                      <>
                        <svg className="animate-spin h-3 w-3 lg:h-4 lg:w-4" viewBox="0 0 24 24">
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
                        Connecting...
                      </>
                    ) : !hasAccess ? (
                      <span className="text-slate-500">No Access</span>
                    ) : (
                      <>
                        Enter
                        <svg
                          className="w-3 h-3 lg:w-4 lg:h-4 transition-transform group-hover:translate-x-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </button>
            )
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="shrink-0 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <p className="shrink-0 text-xs lg:text-sm text-slate-500">
          Each region operates as an independent warehouse system
        </p>
      </div>
    </div>
  )
}
