'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle, Download } from '@/lib/lucide-icons'
import { toast } from 'react-hot-toast'
import { getImportConfig } from '@/lib/import-config'
import { Button } from '@/components/ui/button'

interface ImportResult {
 imported: number
 skipped: number
 errors: string[]
}

interface ImportButtonProps {
 entityName: string
 onImportComplete?: () => void
 className?: string
 buttonText?: string
}

export function ImportButton({ entityName, onImportComplete, className = '', buttonText }: ImportButtonProps) {
 const [isOpen, setIsOpen] = useState(false)
 const [file, setFile] = useState<File | null>(null)
 const [importing, setImporting] = useState(false)
 const [result, setResult] = useState<ImportResult | null>(null)
 const [mounted, setMounted] = useState(false)

 useEffect(() => {
   setMounted(true)
 }, [])

 const config = getImportConfig(entityName)
 if (!config) return null

 const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const selectedFile = e.target.files?.[0]
 if (selectedFile) {
 if (selectedFile.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
 selectedFile.type !== 'application/vnd.ms-excel') {
 toast.error('Please select a valid Excel file')
 return
 }
 setFile(selectedFile)
 setResult(null)
 }
 }

 const handleImport = async () => {
 if (!file) {
 toast.error('Please select a file to import')
 return
 }

 setImporting(true)
 const formData = new FormData()
 formData.append('file', file)
 formData.append('entityName', entityName)

 try {
 const response = await fetch('/api/import', {
 method: 'POST',
 body: formData
 })

 if (response.ok) {
 const data = await response.json()
 setResult(data.result)
 toast.success(`Import completed: ${data.result.imported} records imported`)
 if (onImportComplete) {
 onImportComplete()
 }
 } else {
 const error = await response.json()
 toast.error(error.error || 'Import failed')
 }
 } catch (_error) {
 toast.error('Failed to import file')
 } finally {
 setImporting(false)
 }
 }

 const handleClose = () => {
 setIsOpen(false)
 setFile(null)
 setResult(null)
 }

 const downloadTemplate = async () => {
 try {
 const response = await fetch(`/api/import/template?entity=${entityName}`)
 if (response.ok) {
 const blob = await response.blob()
 const url = window.URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `${config.displayName}_template.xlsx`
 a.click()
 window.URL.revokeObjectURL(url)
 } else {
 toast.error('Failed to download template')
 }
 } catch (_error) {
 toast.error('Error downloading template')
 }
 }

 // Generate field information for the modal
 const requiredFields = config.fieldMappings
 .filter(m => m.required)
 .map(m => m.excelColumns[0])
 .join(', ')

 return (
 <>
 <Button
 onClick={() => setIsOpen(true)}
 variant="outline"
 className={className}
 >
 <Upload className="h-4 w-4 mr-2" />
 {buttonText || `Import ${config.displayName}`}
 </Button>

 {isOpen && mounted
   ? createPortal(
       <div className="fixed inset-0 z-[9998]">
         <div className="flex h-full w-full items-center justify-center p-4">
           <div className="fixed inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />

           <div className="relative w-full max-w-lg overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow-xl">
 <div className="bg-white dark:bg-slate-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-lg font-medium text-slate-900">
 Import {config.displayName}
 </h3>
 <Button
 onClick={handleClose}
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 >
 <X className="h-5 w-5" />
 </Button>
 </div>

 <div className="space-y-4">
 {/* Instructions */}
 <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
 <div className="text-sm text-cyan-800">
 <p className="font-medium mb-1">Import Instructions:</p>
 <ul className="list-disc list-inside space-y-1 text-xs">
 <li>File must be in Excel format (.xlsx or .xls)</li>
 <li>Required columns: {requiredFields}</li>
 <li>First row should contain column headers</li>
 <li>Duplicate records will be updated based on: {config.uniqueFields.join(', ')}</li>
 </ul>
 </div>
 </div>

 {/* Template download */}
 <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
 <div>
 <p className="text-sm font-medium text-slate-900">Need a template?</p>
 <p className="text-xs text-slate-500">Download a pre-formatted Excel template</p>
 </div>
 <button
 onClick={downloadTemplate}
 className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded text-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50"
 >
 <Download className="h-3 w-3 mr-1" />
 Template
 </button>
 </div>

 {/* File upload */}
 <div>
 <label htmlFor={`import-file-${entityName}`} className="block text-sm font-medium text-slate-700 mb-2">
 Select Excel file
 </label>
 <input
 id={`import-file-${entityName}`}
 name="importFile"
 type="file"
 accept=".xlsx,.xls"
 onChange={handleFileChange}
 className="block w-full text-sm text-slate-500
 file:mr-4 file:py-2 file:px-4
 file:rounded-md file:border-0
 file:text-sm file:font-medium
 file:bg-primary file:text-white
 hover:file:bg-primary-dark
 file:cursor-pointer"
 aria-label={`Select Excel file to import ${config.displayName}`}
 aria-describedby={`import-file-${entityName}-help`}
 />
 <span id={`import-file-${entityName}-help`} className="sr-only">
 Upload an Excel file containing {config.displayName} data to import
 </span>
 {file && (
 <p className="mt-2 text-sm text-slate-600">
 Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
 </p>
 )}
 </div>

 {/* Import results */}
 {result && (
 <div className="border rounded-lg p-3">
 <div className="flex items-center justify-between mb-2">
 <h4 className="font-medium">Import Results</h4>
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
 result.errors.length === 0 
 ? 'bg-green-100 text-green-800'
 : 'bg-yellow-100 text-yellow-800'
 }`}>
 {result.errors.length === 0 ? (
 <>
 <CheckCircle className="h-3 w-3 mr-1" />
 Success
 </>
 ) : (
 <>
 <AlertCircle className="h-3 w-3 mr-1" />
 Partial Success
 </>
 )}
 </span>
 </div>
 
 <div className="grid grid-cols-2 gap-2 text-sm mb-2">
 <div>
 <span className="text-slate-500">Imported:</span>
 <span className="ml-2 font-medium text-green-600">{result.imported}</span>
 </div>
 <div>
 <span className="text-slate-500">Skipped:</span>
 <span className="ml-2 font-medium text-yellow-600">{result.skipped}</span>
 </div>
 </div>
 
 {result.errors.length > 0 && (
 <div className="mt-2 p-2 bg-red-50 rounded text-xs">
 <p className="font-medium text-red-900 mb-1">Errors:</p>
 <ul className="text-red-800 space-y-0.5">
 {result.errors.slice(0, 5).map((error, idx) => (
 <li key={idx}>• {error}</li>
 ))}
 {result.errors.length > 5 && (
 <li>• ...and {result.errors.length - 5} more errors</li>
 )}
 </ul>
 </div>
 )}
 </div>
 )}
 </div>
 </div>

 <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
 <button
 onClick={handleImport}
 disabled={!file || importing}
 className="w-full inline-flex justify-center rounded-md border border-transparent shadow-soft px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {importing ? (
 <>
 <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
 </svg>
 Importing...
 </>
 ) : (
 <>
 <FileSpreadsheet className="h-4 w-4 mr-2" />
 Import
 </>
 )}
 </button>
 <button
 onClick={handleClose}
 className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-soft px-4 py-2 bg-white dark:bg-slate-800 text-base font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
 >
 Cancel
 </button>
             </div>
           </div>
         </div>
       </div>,
       document.body
     )
   : null}
 </>
 )
}