'use client'

import { useState, useEffect } from 'react'
import { Download, Calendar } from '@/lib/lucide-icons'
import { toast } from 'react-hot-toast'
import { LucideIcon } from '@/lib/lucide-icons'

interface Warehouse {
 id: string
 name: string
}

interface Report {
 name: string
 description: string
 reportType: string
}

interface ReportSection {
 title: string
 icon: LucideIcon
 reports: Report[]
}

interface ReportGeneratorProps {
 showCustomFormat?: boolean
 reportSections: ReportSection[]
 customReportTypes?: Array<{value: string, label: string}>
}

export function ReportGenerator({ 
 showCustomFormat = false,
 reportSections,
 customReportTypes = [
 { value: 'monthly-inventory', label: 'Monthly Inventory' },
 { value: 'inventory-ledger', label: 'Inventory Ledger' },
 { value: 'storage-charges', label: 'Storage Charges' },
 { value: 'cost-summary', label: 'Cost Summary' },
 { value: 'inventory-balance', label: 'Current Inventory Balance' },
 { value: 'reconciliation', label: 'Invoice Reconciliation' },
 { value: 'cost-analysis', label: 'Cost Analysis' },
 { value: 'monthly-billing', label: 'Monthly Billing Summary' },
 ]
}: ReportGeneratorProps) {
 const [generatingReport, setGeneratingReport] = useState<string | null>(null)
 const [customReportType, setCustomReportType] = useState(customReportTypes[0]?.value || 'monthly-inventory')
 const [customPeriod, setCustomPeriod] = useState(new Date().toISOString().slice(0, 7))
 const [customWarehouseId, setCustomWarehouseId] = useState('')
 const [customFormat, setCustomFormat] = useState<'xlsx' | 'csv' | 'pdf'>('xlsx')
 const [warehouses, setWarehouses] = useState<Warehouse[]>([])
 const [generatingCustom, setGeneratingCustom] = useState(false)

 useEffect(() => {
 fetchWarehouses()
 }, [])

 const fetchWarehouses = async () => {
 try {
 const response = await fetch('/api/warehouses')
 if (response.ok) {
 const data = await response.json()
 setWarehouses(data)
 }
 } catch (_error) {
 // Silent error handling
 }
 }

 const generateReport = async (reportType: string, reportName: string) => {
 setGeneratingReport(reportType)
 
 try {
 const currentDate = new Date()
 const year = currentDate.getFullYear()
 const month = currentDate.getMonth() + 1
 const period = `${year}-${month.toString().padStart(2, '0')}`

 const response = await fetch('/api/reports', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 reportType,
 period,
 }),
 })

 if (!response.ok) {
 throw new Error('Failed to generate report')
 }

 // Get the filename from the response headers
 const contentDisposition = response.headers.get('content-disposition')
 const filename = extractFilename(contentDisposition, `${reportType}-${period}.xlsx`)

 // Download the file
 const blob = await response.blob()
 const url = window.URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = filename
 document.body.appendChild(a)
 a.click()
 window.URL.revokeObjectURL(url)
 document.body.removeChild(a)

 toast.success(`${reportName} generated successfully!`)
 } catch (_error) {
 toast.error('Failed to generate report')
 } finally {
 setGeneratingReport(null)
 }
 }

 const generateCustomReport = async () => {
 setGeneratingCustom(true)
 
 try {
 const body: {
 reportType: string
 warehouseId?: string
 period?: string
 startDate?: string
 endDate?: string
 exportFormat: string
 } = {
 reportType: customReportType,
 period: customPeriod,
 warehouseId: customWarehouseId || undefined,
 exportFormat: showCustomFormat ? customFormat : 'xlsx'
 }

 const response = await fetch('/api/reports', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(body),
 })

 if (!response.ok) {
 throw new Error('Failed to generate report')
 }

 // Get the filename from the response headers
 const contentDisposition = response.headers.get('content-disposition')
 const fileExtension = showCustomFormat ? customFormat : 'xlsx'
 const filename = extractFilename(
 contentDisposition,
 `${customReportType}-${customPeriod}.${fileExtension}`
 )

 // Download the file
 const blob = await response.blob()
 const url = window.URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = filename
 document.body.appendChild(a)
 a.click()
 window.URL.revokeObjectURL(url)
 document.body.removeChild(a)

 toast.success('Custom report generated successfully!')
 } catch (_error) {
 toast.error('Failed to generate custom report')
 } finally {
 setGeneratingCustom(false)
 }
 }

 return (
 <div className="space-y-6">
 {/* Report Sections */}
 {reportSections.map((section) => (
 <ReportSectionComponent
 key={section.title}
 title={section.title}
 icon={section.icon}
 reports={section.reports.map(report => ({
 ...report,
 action: () => generateReport(report.reportType, report.name),
 loading: generatingReport === report.reportType,
 }))}
 />
 ))}

 {/* Custom Reports */}
 <div className="bg-slate-50 rounded-xl p-6">
 <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
 <Calendar className="h-5 w-5" />
 Custom Reports
 </h3>
 <div className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label htmlFor="custom-report-type" className="block text-sm font-medium mb-2">Report Type</label>
 <select 
 id="custom-report-type"
 name="reportType"
 className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
 value={customReportType}
 onChange={(e) => setCustomReportType(e.target.value)}
 aria-label="Select report type"
 aria-describedby="custom-report-type-help"
 >
 {customReportTypes.map(type => (
 <option key={type.value} value={type.value}>{type.label}</option>
 ))}
 </select>
 <span id="custom-report-type-help" className="sr-only">Choose the type of report you want to generate</span>
 </div>
 <div>
 <label htmlFor="custom-date-range" className="block text-sm font-medium mb-2">Date Range</label>
 <input
 id="custom-date-range"
 name="dateRange"
 type="month"
 className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
 value={customPeriod}
 onChange={(e) => setCustomPeriod(e.target.value)}
 aria-label="Select month and year for report"
 aria-describedby="custom-date-range-help"
 />
 <span id="custom-date-range-help" className="sr-only">Select the month and year for the report period</span>
 </div>
 </div>
 <div>
 <label htmlFor="custom-warehouse" className="block text-sm font-medium mb-2">Warehouse</label>
 <select 
 id="custom-warehouse"
 name="warehouse"
 className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
 value={customWarehouseId}
 onChange={(e) => setCustomWarehouseId(e.target.value)}
 aria-label="Select warehouse for report"
 aria-describedby="custom-warehouse-help"
 >
 <option value="">All Warehouses</option>
 {warehouses.map(warehouse => (
 <option key={warehouse.id} value={warehouse.id}>
 {warehouse.name}
 </option>
 ))}
 </select>
 <span id="custom-warehouse-help" className="sr-only">Select which warehouse to include in the report, or choose all warehouses</span>
 </div>
 {showCustomFormat && (
 <div>
 <label htmlFor="custom-export-format" className="block text-sm font-medium mb-2">Export Format</label>
 <select 
 id="custom-export-format"
 name="exportFormat"
 className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
 value={customFormat}
 onChange={(e) => setCustomFormat(e.target.value as 'xlsx' | 'csv' | 'pdf')}
 aria-label="Select export format"
 aria-describedby="custom-export-format-help"
 >
 <option value="xlsx">Excel (.xlsx)</option>
 <option value="csv">CSV (.csv)</option>
 <option value="pdf">PDF (.pdf)</option>
 </select>
 <span id="custom-export-format-help" className="sr-only">Choose the file format for the exported report</span>
 </div>
 )}
 <button
 onClick={generateCustomReport}
 disabled={generatingCustom}
 className="w-full md:w-auto px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {generatingCustom ? 'Generating...' : 'Generate Custom Report'}
 </button>
 </div>
 </div>
 </div>
 )
}

const extractFilename = (contentDisposition: string | null, fallback: string): string => {
 if (!contentDisposition) {
 return fallback
 }

 const match = /filename\*?=([^;]+)/i.exec(contentDisposition)
 if (!match || !match[1]) {
 return fallback
 }

 const value = match[1].trim().replace(/^"|"$/g, '')
 return value.length > 0 ? value : fallback
}

interface ReportSectionComponentProps {
 title: string
 icon: React.ElementType
 reports: {
 name: string
 description: string
 action: () => void
 loading?: boolean
 }[]
}

function ReportSectionComponent({ title, icon: Icon, reports }: ReportSectionComponentProps) {
 return (
 <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-soft ">
 <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
 <Icon className="h-5 w-5" />
 {title}
 </h3>
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
 {reports.map((report) => (
 <div
 key={report.name}
 className="p-4 border rounded-xl hover:shadow-md transition-shadow cursor-pointer"
 onClick={report.action}
 >
 <h4 className="font-medium mb-1">{report.name}</h4>
 <p className="text-sm text-muted-foreground mb-3">
 {report.description}
 </p>
 <button
 disabled={report.loading}
 className="inline-flex items-center text-sm text-primary hover:underline disabled:opacity-50"
 >
 <Download className="h-4 w-4 mr-1" />
 {report.loading ? 'Generating...' : 'Download'}
 </button>
 </div>
 ))}
 </div>
 </div>
 )
}
