import { useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { withBasePath } from '@/lib/utils/base-path'

interface UploadProgress {
 loaded: number
 total: number
 percentage: number
}

interface UploadResult {
 s3Key: string
 fileName: string
 fileSize: number
 fileType: string
 viewUrl: string
}

interface UseS3UploadOptions {
 onProgress?: (progress: UploadProgress) => void
 onSuccess?: (result: UploadResult) => void
 onError?: (error: Error) => void
}

export function useS3Upload(options: UseS3UploadOptions = {}) {
 const [isUploading, setIsUploading] = useState(false)
 const [progress, setProgress] = useState<UploadProgress>({ loaded: 0, total: 0, percentage: 0 })

 const uploadToS3 = useCallback(async (
 file: File,
 context: {
 type: 'transaction'
 transactionId: string
 documentType: string
 }
 ): Promise<UploadResult | null> => {
 setIsUploading(true)
 setProgress({ loaded: 0, total: file.size, percentage: 0 })

 try {
 // Step 1: Get presigned URL
 const presignedResponse = await fetch(withBasePath('/api/upload/generate-presigned-url'), {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 fileName: file.name,
 fileType: file.type,
 fileSize: file.size,
 context
 })
 })

 if (!presignedResponse.ok) {
 const error = await presignedResponse.json()
 // console.error('Presigned URL generation failed:', error)
 throw new Error(error.error || 'Failed to get upload URL')
 }

 const { uploadUrl, viewUrl, s3Key } = await presignedResponse.json()
 

 // Step 2: Upload directly to S3
 const xhr = new XMLHttpRequest()

 // Track upload progress
 xhr.upload.addEventListener('progress', (event) => {
 if (event.lengthComputable) {
 const progressData = {
 loaded: event.loaded,
 total: event.total,
 percentage: Math.round((event.loaded / event.total) * 100)
 }
 setProgress(progressData)
 options.onProgress?.(progressData)
 }
 })

 // Create a promise for the upload
 const uploadPromise = new Promise<void>((resolve, reject) => {
 xhr.onload = () => {
 if (xhr.status === 200 || xhr.status === 204) {
 resolve()
 } else {
 // console.error('S3 Upload Failed:', xhr.responseText)
 reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`))
 }
 }
 xhr.onerror = () => {
 // console.error('Network error during S3 upload')
 reject(new Error('Network error during upload'))
 }
 })

 // Perform the upload
 xhr.open('PUT', uploadUrl)
 xhr.setRequestHeader('Content-Type', file.type)
 
 // Note: Do not add additional headers as they must match the presigned URL signature
 
 xhr.send(file)

 await uploadPromise

 const result: UploadResult = {
 s3Key,
 fileName: file.name,
 fileSize: file.size,
 fileType: file.type,
 viewUrl
 }

 options.onSuccess?.(result)
 toast.success('File uploaded successfully')
 
 return result
 } catch (_error) {
 const err = _error instanceof Error ? _error : new Error('Upload failed')
 options.onError?.(err)
 toast.error(err.message)
 // console.error('S3 upload error:', _error)
 return null
 } finally {
 setIsUploading(false)
 }
 }, [options])

 const uploadMultiple = useCallback(async (
 files: File[],
 context: {
 type: 'transaction'
 transactionId: string
 documentType: string
 }
 ): Promise<UploadResult[]> => {
 const results: UploadResult[] = []
 
 for (const file of files) {
 const result = await uploadToS3(file, context)
 if (result) {
 results.push(result)
 }
 }
 
 return results
 }, [uploadToS3])

 return {
 uploadToS3,
 uploadMultiple,
 isUploading,
 progress
 }
}
