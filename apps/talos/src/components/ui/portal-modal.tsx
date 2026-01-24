'use client'

import { cn } from '@/lib/utils'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface PortalModalProps {
  open: boolean
  children: React.ReactNode
  className?: string
  onClose?: () => void
}

export function PortalModal({ open, children, className, onClose }: PortalModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle ESC key to close modal
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9998]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 flex h-full w-full justify-center p-4 items-center',
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
