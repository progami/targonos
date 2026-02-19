'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Minus, Plus } from '@/lib/lucide-icons'
import { cn } from '@/lib/utils'

type ZoomablePdfIframeProps = {
  title: string
  src: string
  className?: string
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1

function clampZoom(value: number) {
  if (value < MIN_ZOOM) return MIN_ZOOM
  if (value > MAX_ZOOM) return MAX_ZOOM
  return value
}

function roundZoom(value: number) {
  return Math.round(value * 10) / 10
}

export function ZoomablePdfIframe({ title, src, className }: ZoomablePdfIframeProps) {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    setZoom(1)
  }, [src])

  const zoomPercent = useMemo(() => Math.round(zoom * 100), [zoom])

  const canZoomOut = zoom > MIN_ZOOM
  const canZoomIn = zoom < MAX_ZOOM

  return (
    <div className={cn('relative h-full w-full', className)}>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border bg-white/90 dark:bg-slate-900/80 px-1 py-1 shadow-sm backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setZoom(prev => clampZoom(roundZoom(prev - ZOOM_STEP)))}
          disabled={!canZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setZoom(1)}
          aria-label="Reset zoom"
          title="Reset zoom"
          className="tabular-nums"
        >
          {zoomPercent}%
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setZoom(prev => clampZoom(roundZoom(prev + ZOOM_STEP)))}
          disabled={!canZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-full w-full overflow-auto">
        <div className="flex h-full w-full justify-center">
          <iframe
            title={title}
            src={src}
            className="h-full"
            style={{ width: `${zoom * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

