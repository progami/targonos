'use client'

import { cn } from '@/lib/utils'
import { List, Image, Layers } from 'lucide-react'

interface VersionBarProps {
  listing: { id: string; asin: string; label: string }
  bullets: { seq: number; createdAt: string } | null
  gallery: { seq: number; createdAt: string } | null
  ebc: { seq: number; createdAt: string } | null
  totalSnapshots: number
  activeTrack?: string | null
  onTrackSelect?: (track: string | null) => void
}

export function VersionBar({
  listing,
  bullets,
  gallery,
  ebc,
  totalSnapshots,
  activeTrack,
  onTrackSelect,
}: VersionBarProps) {
  const tracks = [
    {
      key: 'bullets',
      label: 'Bullets',
      icon: List,
      version: bullets ? `v${bullets.seq}` : '—',
      date: bullets?.createdAt,
    },
    {
      key: 'gallery',
      label: 'Images',
      icon: Image,
      version: gallery ? `v${gallery.seq}` : '—',
      date: gallery?.createdAt,
    },
    {
      key: 'ebc',
      label: 'EBC',
      icon: Layers,
      version: ebc ? `v${ebc.seq}` : '—',
      date: ebc?.createdAt,
    },
  ]

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground mr-2">
          {listing.asin}
        </span>
        {tracks.map((track) => {
          const Icon = track.icon
          const isActive = activeTrack === track.key
          return (
            <button
              key={track.key}
              onClick={() => onTrackSelect?.(isActive ? null : track.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
            >
              <Icon className="w-3 h-3" />
              {track.label} {track.version}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {totalSnapshots} snapshot{totalSnapshots !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
