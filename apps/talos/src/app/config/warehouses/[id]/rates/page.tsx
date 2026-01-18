'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { DollarSign, Loader2, Upload, Download, Trash2 } from '@/lib/lucide-icons'
import { Button } from '@/components/ui/button'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { toast } from 'react-hot-toast'
import { WarehouseRatesPanel } from '../../warehouse-rates-panel'
import { useRef, ChangeEvent } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Warehouse {
  id: string
  code: string
  name: string
  address?: string | null
  rateListAttachment?: {
    fileName: string
    size: number
    contentType: string
    uploadedAt: string
  } | null
}

export default function WarehouseRatesPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const loadWarehouse = useCallback(async () => {
    try {
      const response = await fetchWithCSRF(`/api/warehouses?id=${id}`)
      if (response.ok) {
        const data = await response.json()
        // API returns array when queried by id, get first item
        const warehouseData = Array.isArray(data) ? data[0] : data
        setWarehouse(warehouseData)
      }
    } catch (error) {
      console.error('Failed to load warehouse:', error)
      toast.error('Failed to load warehouse')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadWarehouse()
  }, [loadWarehouse])

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !warehouse) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetchWithCSRF(`/api/warehouses/${warehouse.id}/rate-list`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Failed to upload')
      }

      toast.success('Rate list uploaded')
      await loadWarehouse()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownload = async () => {
    if (!warehouse) return
    setDownloading(true)
    try {
      const response = await fetchWithCSRF(`/api/warehouses/${warehouse.id}/rate-list`)
      if (!response.ok) throw new Error('Download unavailable')

      const data = await response.json()
      if (data?.attachment?.downloadUrl) {
        window.open(data.attachment.downloadUrl, '_blank', 'noopener')
      } else {
        toast.error('Download link unavailable')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const handleRemoveAttachment = () => {
    if (!warehouse) return
    setShowRemoveConfirm(true)
  }

  const handleConfirmRemove = async () => {
    if (!warehouse) return

    setShowRemoveConfirm(false)
    try {
      const response = await fetchWithCSRF(`/api/warehouses/${warehouse.id}/rate-list`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to remove')
      toast.success('Attachment removed')
      await loadWarehouse()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed')
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </DashboardLayout>
    )
  }

  if (!warehouse) {
    return (
      <DashboardLayout>
        <PageContainer>
          <PageHeaderSection
            title="Warehouse not found"
            description="Configuration"
            icon={DollarSign}
            backHref="/config/warehouses"
            backLabel="Back"
          />
          <PageContent>
            <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft p-6 text-sm text-muted-foreground">
              Warehouse not found.
            </div>
          </PageContent>
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection
          title={warehouse.name}
          description={`Rate Sheet • ${warehouse.code}`}
          icon={DollarSign}
          backHref="/config/warehouses"
          backLabel="Back"
          actions={
            <div className="flex items-center gap-3">
              {/* Rate List Attachment Actions */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <span className="text-xs text-slate-600 dark:text-slate-400">Rate List:</span>
                {warehouse.rateListAttachment ? (
                  <>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[150px] truncate">
                      {warehouse.rateListAttachment.fileName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownload}
                      disabled={downloading}
                      className="h-7 px-2"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveAttachment}
                      className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">None</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="h-7 px-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          }
        />

        <PageContent>
          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft p-6">
            <WarehouseRatesPanel
              warehouseId={warehouse.id}
              warehouseName={warehouse.name}
              warehouseCode={warehouse.code}
            />
          </div>
        </PageContent>
      </PageContainer>

      {/* Remove Attachment Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={handleConfirmRemove}
        title="Remove Attachment"
        message="Are you sure you want to remove the rate list attachment?"
        type="warning"
        confirmText="Remove"
        cancelText="Cancel"
      />
    </DashboardLayout>
  )
}
