'use client'

import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, File } from '@/lib/lucide-icons'

interface ExportButtonProps {
 endpoint: string
 fileName?: string
 buttonText?: string
 className?: string
 formats?: ('xlsx' | 'csv' | 'pdf')[]
 onExport?: (format: string) => void
}

export function ExportButton({ 
 endpoint, 
 fileName = 'export',
 buttonText = 'Export',
 className = '',
 formats = ['xlsx'],
 onExport
}: ExportButtonProps) {
 const [loading, setLoading] = useState(false)
 const [showFormats, setShowFormats] = useState(false)

 const formatIcons = {
 xlsx: FileSpreadsheet,
 csv: File,
 pdf: FileText
 }

 const formatNames = {
 xlsx: 'Excel',
 csv: 'CSV',
 pdf: 'PDF'
 }

 const handleExport = async (format: string = 'xlsx') => {
 setLoading(true)
 setShowFormats(false)
 
 try {
 let url = endpoint
 
 // If endpoint already has query params, append with &, otherwise use ?
 const separator = endpoint.includes('?') ? '&' : '?'
 url = `${endpoint}${separator}format=${format}`
 
 const response = await fetch(url)
 
 if (response.ok) {
 const contentType = response.headers.get('content-type')
 
 // Check if response is JSON (new S3-based format) or direct file download
 if (contentType?.includes('application/json')) {
 const data = await response.json()
 if (data.downloadUrl) {
 // S3-based export - open the presigned URL
 const a = document.createElement('a')
 a.href = data.downloadUrl
 a.download = data.filename || `${fileName}_${new Date().toISOString().split('T')[0]}.${format}`
 document.body.appendChild(a)
 a.click()
 document.body.removeChild(a)
 } else {
 alert('Export failed: No download URL provided')
 }
 } else {
 // Legacy direct file download
 const blob = await response.blob()
 const objectUrl = window.URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = objectUrl
 a.download = `${fileName}_${new Date().toISOString().split('T')[0]}.${format}`
 document.body.appendChild(a)
 a.click()
 window.URL.revokeObjectURL(objectUrl)
 document.body.removeChild(a)
 }
 
 if (onExport) {
 onExport(format)
 }
 } else {
 const errorData = await response.json().catch(() => null)
 alert(errorData?.error || 'Export failed')
 }
 } catch (_error) {
 // console.error('Export error:', error)
 alert('Error during export')
 } finally {
 setLoading(false)
 }
 }

 if (formats.length === 1) {
 return (
 <button
 onClick={() => handleExport(formats[0])}
 disabled={loading}
 className={`inline-flex items-center px-4 py-2 border border-slate-300 rounded-md shadow-soft text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 ${className}`}
 >
 <Download className="h-4 w-4 mr-2" />
 {loading ? 'Exporting...' : buttonText}
 </button>
 )
 }

 return (
 <div className="relative inline-block">
 <button
 onClick={() => setShowFormats(!showFormats)}
 disabled={loading}
 className={`inline-flex items-center px-4 py-2 border border-slate-300 rounded-md shadow-soft text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 ${className}`}
 >
 <Download className="h-4 w-4 mr-2" />
 {loading ? 'Exporting...' : buttonText}
 </button>
 
 {showFormats && (
 <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-slate-800 ring-1 ring-black ring-opacity-5 z-10">
 <div className="py-1" role="menu">
 {formats.map((format) => {
 const Icon = formatIcons[format]
 return (
 <button
 key={format}
 onClick={() => handleExport(format)}
 className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center gap-2"
 role="menuitem"
 >
 <Icon className="h-4 w-4" />
 Export as {formatNames[format]}
 </button>
 )
 })}
 </div>
 </div>
 )}
 </div>
 )
}