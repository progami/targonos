'use client'

// This is a staging version of AttachmentsTab for edit mode
// It only stages changes locally without uploading to S3 until Save is clicked

import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { Upload, FileText, X, Check } from '@/lib/lucide-icons'

interface Attachment {
 name: string
 type: string
 size: number
 s3Key?: string
 viewUrl?: string
 category: string
 file?: File // For new uploads
 deleted?: boolean // Mark for deletion
 isNew?: boolean // Mark as new upload
}

export interface ApiAttachment {
 fileName?: string
 name?: string
 contentType?: string
 type?: string
 size?: number
 s3Key?: string
 s3Url?: string
 viewUrl?: string
}

interface EditAttachmentsTabProps {
 existingAttachments: Record<string, ApiAttachment> | null
 onAttachmentsChange: (attachments: Record<string, Attachment | null>) => void
 transactionType?: 'RECEIVE' | 'SHIP' | 'ADJUST_IN' | 'ADJUST_OUT'
}

// Document categories for RECEIVE transactions
const RECEIVE_CATEGORIES = [
 {
 id: 'commercial_invoice',
 label: 'Commercial Invoice',
 description: 'Invoice with pricing',
 required: false
 },
 {
 id: 'bill_of_lading',
 label: 'Bill of Lading',
 description: 'Carrier document',
 required: false
 },
 {
 id: 'packing_list',
 label: 'Packing List',
 description: 'Items & quantities',
 required: false
 },
 {
 id: 'movement_note',
 label: 'Movement Note',
 description: 'Proof of movement',
 required: false
 },
 {
 id: 'cube_master',
 label: 'Cube Master',
 description: 'Pallet stacking config',
 required: false
 },
 {
 id: 'transaction_certificate',
 label: 'TC GRS',
 description: 'Movement Note Slip',
 required: false
 },
 {
 id: 'custom_declaration',
 label: 'CDS',
 description: 'Customs clearance',
 required: false
 }
]

// Document categories for SHIP transactions
const SHIP_CATEGORIES = [
 {
 id: 'packing_list',
 label: 'Packing List',
 description: 'Items & quantities for shipment',
 required: false
 },
 {
 id: 'movement_note',
 label: 'Movement Note',
 description: 'Shipping documentation',
 required: false
 }
]

const parseApiAttachment = (category: string, value: ApiAttachment | undefined): Attachment | null => {
 if (!value) {
 return null
 }

 const name = typeof value.fileName === 'string'
 ? value.fileName
 : typeof value.name === 'string'
 ? value.name
 : 'Unknown file'

 const type = typeof value.contentType === 'string'
 ? value.contentType
 : typeof value.type === 'string'
 ? value.type
 : 'application/octet-stream'

 const size = typeof value.size === 'number' ? value.size : 0

 return {
 name,
 type,
 size,
 s3Key: typeof value.s3Key === 'string' ? value.s3Key : undefined,
 viewUrl:
 typeof value.s3Url === 'string'
 ? value.s3Url
 : typeof value.viewUrl === 'string'
 ? value.viewUrl
 : undefined,
 category,
 }
}

export type EditAttachment = Attachment

export function EditAttachmentsTab({ existingAttachments, onAttachmentsChange, transactionType = 'RECEIVE' }: EditAttachmentsTabProps) {
 const [stagedAttachments, setStagedAttachments] = useState<Record<string, Attachment | null>>({})
 
 // Select appropriate document categories based on transaction type
 const attachmentCategories = transactionType === 'SHIP' ? SHIP_CATEGORIES : RECEIVE_CATEGORIES

 // Initialize with existing attachments
 useEffect(() => {
 if (existingAttachments) {
 const initial: Record<string, Attachment | null> = {}
 
 // Convert existing attachments to our format
 for (const [category, attachment] of Object.entries(existingAttachments)) {
 const parsed = parseApiAttachment(category, attachment)
 if (parsed) {
 initial[category] = { ...parsed, isNew: false, deleted: false }
 }
 }
 
 setStagedAttachments(initial)
 }
 }, [existingAttachments])

 const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, category: string) => {
 const file = event.target.files?.[0]
 if (!file) return

 // Validate file size (5MB max)
 if (file.size > 5 * 1024 * 1024) {
 toast.error(`${file.name} is too large. Maximum size is 5MB.`)
 return
 }

 // Validate file type
 const allowedTypes = [
 'application/pdf',
 'image/jpeg',
 'image/png',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 ]
 
 if (!allowedTypes.includes(file.type)) {
 toast.error(`${file.name}: Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX`)
 return
 }

 // Stage the file locally (don't upload to S3 yet)
 const attachment: Attachment = {
 name: file.name,
 type: file.type,
 size: file.size,
 category,
 file: file, // Store the actual File object
 isNew: true,
 deleted: false
 }
 
 const newAttachments = { ...stagedAttachments, [category]: attachment }
 setStagedAttachments(newAttachments)
 onAttachmentsChange(newAttachments)
 // No toast - the visual indicators are enough
 
 // Reset input
 event.target.value = ''
 }

 const removeAttachment = (category: string) => {
 const current = stagedAttachments[category]
 
 if (current?.isNew) {
 // If it's a new upload that hasn't been saved, just remove it
 const newAttachments = { ...stagedAttachments }
 delete newAttachments[category]
 setStagedAttachments(newAttachments)
 onAttachmentsChange(newAttachments)
 // No toast needed
 } else if (current) {
 // If it's an existing attachment, mark it for deletion
 const newAttachments = {
 ...stagedAttachments,
 [category]: { ...current, deleted: true }
 }
 setStagedAttachments(newAttachments)
 onAttachmentsChange(newAttachments)
 // No toast - the red "TO DELETE" badge is clear enough
 }
 }

 const undoRemove = (category: string) => {
 const current = stagedAttachments[category]
 if (current?.deleted) {
 const newAttachments = {
 ...stagedAttachments,
 [category]: { ...current, deleted: false }
 }
 setStagedAttachments(newAttachments)
 onAttachmentsChange(newAttachments)
 // No toast needed
 }
 }

 const formatFileSize = (bytes: number): string => {
 if (bytes < 1024) return bytes + ' B'
 if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
 return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
 }

 return (
 <div className="space-y-6">
 <div className="bg-white dark:bg-slate-800 rounded-xl border">
 <div className="px-6 py-4 border-b bg-slate-50">
 <h3 className="text-lg font-semibold flex items-center gap-2">
 <FileText className="h-5 w-5" />
 Transaction Documents (Staged Changes)
 </h3>
 <p className="text-sm text-slate-600 mt-1">
 Changes will only be saved when you click Save
 </p>
 </div>
 
 <div className="p-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 {attachmentCategories.map(category => {
 const attachment = stagedAttachments[category.id]
 const isDeleted = attachment?.deleted
 
 return (
 <div key={category.id} className={`border rounded-lg p-4 ${isDeleted ? 'bg-red-50 border-red-200' : 'bg-slate-50'} hover:shadow-soft transition-shadow`}>
 <div className="flex items-start justify-between mb-3">
 <div className="flex-1">
 <h4 className="font-medium text-sm flex items-center gap-2">
 {category.label}
 {attachment && !isDeleted && (
 <Check className="h-4 w-4 text-green-600" />
 )}
 {attachment?.isNew && !isDeleted && (
 <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">NEW</span>
 )}
 {isDeleted && (
 <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">TO DELETE</span>
 )}
 </h4>
 <p className="text-xs text-slate-600 mt-0.5">{category.description}</p>
 </div>
 </div>
 
 {attachment && !isDeleted ? (
 <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 flex-1 min-w-0">
 <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
 <div className="min-w-0 flex-1">
 <p className="text-sm text-slate-700 truncate">{attachment.name}</p>
 <p className="text-xs text-slate-500">{formatFileSize(attachment.size)}</p>
 </div>
 </div>
 <div className="flex items-center gap-1 ml-2">
 <label 
 htmlFor={`${category.id}-replace`}
 className="text-cyan-600 hover:text-cyan-800 cursor-pointer p-1"
 title="Replace file"
 >
 <Upload className="h-4 w-4" />
 </label>
 <button
 type="button"
 onClick={() => removeAttachment(category.id)}
 className="text-red-600 hover:text-red-800 p-1"
 title="Mark for deletion"
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 </div>
 <input
 id={`${category.id}-replace`}
 type="file"
 accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
 onChange={(e) => handleFileUpload(e, category.id)}
 className="hidden"
 />
 </div>
 ) : isDeleted ? (
 <div className="bg-red-100 p-3 rounded border border-red-200">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-red-500" />
 <div>
 <p className="text-sm text-red-700 line-through">{attachment.name}</p>
 <p className="text-xs text-red-600">Will be deleted on save</p>
 </div>
 </div>
 <button
 type="button"
 onClick={() => undoRemove(category.id)}
 className="text-cyan-600 hover:text-cyan-800 p-1 text-sm"
 >
 Undo
 </button>
 </div>
 </div>
 ) : (
 <div className="upload-container">
 <label htmlFor={`${category.id}-upload`} className="cursor-pointer block">
 <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
 <Upload className="h-5 w-5 text-slate-400 mx-auto" />
 <p className="text-xs text-slate-600 mt-1">Click to upload</p>
 </div>
 </label>
 <input
 id={`${category.id}-upload`}
 type="file"
 accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
 onChange={(e) => handleFileUpload(e, category.id)}
 className="hidden"
 />
 </div>
 )}
 </div>
 )
 })}
 </div>
 </div>
 </div>
 </div>
 )
}

EditAttachmentsTab.displayName = 'EditAttachmentsTab'
