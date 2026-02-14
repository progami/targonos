'use client'

import { useRef, useEffect, useState } from 'react'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function ListingDetailPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(3000)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return

      // Resize iframe to fit content
      const height = doc.documentElement.scrollHeight
      if (height > 0) {
        setIframeHeight(height)
      }

      // Remove all <a> navigation (prevent clicking away)
      const links = doc.querySelectorAll('a')
      for (const link of links) {
        link.addEventListener('click', (e) => e.preventDefault())
        link.style.cursor = 'default'
      }
    }

    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [])

  return (
    <div className="flex flex-col h-screen">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-4">
          <a
            href={`${basePath}/listings`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Listings
          </a>
          <h1 className="text-lg font-semibold">PDP Replica</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
            Read-only reference
          </span>
        </div>
      </div>

      {/* Replica iframe */}
      <div className="flex-1 overflow-auto bg-white">
        <iframe
          ref={iframeRef}
          src={`${basePath}/api/fixture/replica.html`}
          className="w-full border-0"
          style={{ height: iframeHeight }}
          title="Amazon PDP Replica"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  )
}
