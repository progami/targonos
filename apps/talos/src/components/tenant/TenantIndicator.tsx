'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Box, ButtonBase, CircularProgress, Stack, Typography } from '@mui/material'
import { TenantConfig, TenantCode, TENANTS } from '@/lib/tenant/constants'
import { ChevronRight, MapPin } from '@/lib/lucide-icons'
import { withBasePath } from '@/lib/utils/base-path'

interface TenantIndicatorProps {
  className?: string
  collapsed?: boolean
  showSwitchAction?: boolean
}

// Format timezone to readable city name
function formatTimezone(timezone: string): string {
  // Extract city from timezone (e.g., "America/Los_Angeles" -> "Los Angeles")
  const parts = timezone.split('/')
  const city = parts[parts.length - 1].replace(/_/g, ' ')
  return city
}

export function FlatFlag({ code, size = 24 }: { code: TenantCode; size?: number }) {
  const h = Math.round(size * 2 / 3)
  if (code === 'US') {
    return (
      <svg width={size} height={h} viewBox="0 0 24 16" style={{ borderRadius: 2, flexShrink: 0 }}>
        <rect width="24" height="16" fill="#B22234" />
        <rect y="1.23" width="24" height="1.23" fill="#FFF" />
        <rect y="3.69" width="24" height="1.23" fill="#FFF" />
        <rect y="6.15" width="24" height="1.23" fill="#FFF" />
        <rect y="8.62" width="24" height="1.23" fill="#FFF" />
        <rect y="11.08" width="24" height="1.23" fill="#FFF" />
        <rect y="13.54" width="24" height="1.23" fill="#FFF" />
        <rect width="9.6" height="8.62" fill="#3C3B6E" />
      </svg>
    )
  }
  return (
    <svg width={size} height={h} viewBox="0 0 24 16" style={{ borderRadius: 2, flexShrink: 0 }}>
      <rect width="24" height="16" fill="#012169" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFF" strokeWidth="2.5" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#C8102E" strokeWidth="1.5" />
      <path d="M12,0 V16 M0,8 H24" stroke="#FFF" strokeWidth="4" />
      <path d="M12,0 V16 M0,8 H24" stroke="#C8102E" strokeWidth="2.5" />
    </svg>
  )
}

/**
 * Display-only indicator showing current region.
 * Region switching is only allowed from the WorldMap (landing page).
 */
export function TenantIndicator({ className, collapsed, showSwitchAction = true }: TenantIndicatorProps) {
  const [current, setCurrent] = useState<TenantConfig | null>(null)
  const router = useRouter()

  const handleSwitchRegion = () => {
    router.push('/')
  }

  useEffect(() => {
    // Fetch current tenant on mount
    fetch(withBasePath('/api/tenant/current'), { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.current?.code) {
          setCurrent(TENANTS[data.current.code as TenantCode])
        }
      })
      .catch(console.error)
  }, [])

  if (!current) {
    return (
      <Stack
        className={className}
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{
          borderRadius: '8px',
          color: 'light-dark(rgb(100 116 139), rgb(148 163 184))',
          minHeight: 44,
          px: 1.5,
          py: 1,
        }}
      >
        <CircularProgress size={16} color="inherit" />
        {!collapsed && (
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Loading region</Typography>
        )}
      </Stack>
    )
  }

  const content = (
    <>
      <Box
        sx={{
          alignItems: 'center',
          backgroundColor: 'light-dark(rgba(255,255,255,0.82), rgba(2,6,23,0.4))',
          border: '1px solid',
          borderColor: 'light-dark(rgb(226 232 240), rgb(51 65 85))',
          borderRadius: '6px',
          display: 'flex',
          flexShrink: 0,
          height: 28,
          justifyContent: 'center',
          width: 28,
        }}
      >
        <FlatFlag code={current.code} size={20} />
      </Box>
      {!collapsed && (
        <>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
              <Typography
                noWrap
                sx={{
                  color: 'light-dark(rgb(15 23 42), rgb(241 245 249))',
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.25,
                }}
              >
                {current.displayName}
              </Typography>
              <Box
                aria-hidden="true"
                sx={{
                  backgroundColor: 'light-dark(rgba(6,182,212,0.7), rgba(103,232,249,0.7))',
                  borderRadius: '999px',
                  height: 4,
                  width: 4,
                }}
              />
              <Typography
                noWrap
                sx={{
                  color: 'light-dark(rgb(100 116 139), rgb(148 163 184))',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  lineHeight: 1.25,
                  textTransform: 'uppercase',
                }}
              >
                {current.currency}
              </Typography>
            </Stack>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{ color: 'light-dark(rgb(100 116 139), rgb(148 163 184))', mt: 0.25 }}
            >
              <MapPin size={12} />
              <Typography noWrap sx={{ fontSize: 12, lineHeight: 1.25 }}>
                {formatTimezone(current.timezone)}
              </Typography>
            </Stack>
          </Box>
          {showSwitchAction && (
            <ChevronRight
              size={16}
              aria-hidden="true"
            />
          )}
        </>
      )}
    </>
  )

  const rowSx = {
    alignItems: 'center',
    backgroundColor: 'light-dark(rgba(241,245,249,0.72), rgba(30,41,59,0.45))',
    borderRadius: '8px',
    color: 'light-dark(rgb(51 65 85), rgb(203 213 225))',
    display: 'flex',
    gap: 1.5,
    justifyContent: collapsed ? 'center' : 'flex-start',
    minHeight: 44,
    px: collapsed ? 1 : 1.5,
    py: 1,
    textAlign: 'left',
    transition: 'background-color 160ms ease, color 160ms ease',
    width: '100%',
    '&:hover': {
      backgroundColor: 'light-dark(rgba(226,232,240,0.78), rgba(30,41,59,0.95))',
      color: 'light-dark(rgb(8 145 178), rgb(103 232 249))',
    },
  }

  if (!showSwitchAction) {
    return (
      <Box className={className} sx={rowSx}>
        {content}
      </Box>
    )
  }

  return (
    <ButtonBase
      onClick={handleSwitchRegion}
      className={className}
      sx={rowSx}
      title="Switch region"
      aria-label={`Switch region. Current region: ${current.displayName}, ${formatTimezone(current.timezone)}`}
    >
      {content}
    </ButtonBase>
  )
}
