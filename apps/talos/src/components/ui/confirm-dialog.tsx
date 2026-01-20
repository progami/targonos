'use client'

import React from 'react'
import { AlertTriangle, Info, AlertCircle } from '@/lib/lucide-icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  loading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning',
  loading = false,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
    if (!loading) {
      onClose()
    }
  }

  const typeConfig = {
    danger: {
      icon: AlertCircle,
      iconClass: 'text-red-600 dark:text-red-400',
      bgClass: 'bg-red-100 dark:bg-red-900/30',
      buttonVariant: 'destructive' as const,
    },
    warning: {
      icon: AlertTriangle,
      iconClass: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-100 dark:bg-amber-900/30',
      buttonVariant: 'default' as const,
    },
    info: {
      icon: Info,
      iconClass: 'text-cyan-600 dark:text-cyan-400',
      bgClass: 'bg-cyan-100 dark:bg-cyan-900/30',
      buttonVariant: 'default' as const,
    },
  }

  const config = typeConfig[type]
  const Icon = config.icon

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                config.bgClass
              )}
            >
              <Icon className={cn('h-5 w-5', config.iconClass)} />
            </div>
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-2">{message}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              type === 'warning' && 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700'
            )}
          >
            {loading ? 'Processing...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
