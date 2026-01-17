'use client'

import { useState } from 'react'
import { useS3Upload } from '@/hooks/use-s3-upload'
import { DashboardLayout } from '@/components/layout/dashboard-layout'

interface UploadResult {
 s3Key: string
 fileName: string
 fileSize: number
 viewUrl: string
}

export default function S3UploadTestPage() {
 const [selectedFile, setSelectedFile] = useState<File | null>(null)
 const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
 const [error, setError] = useState<string | null>(null)
 
 const { uploadToS3, isUploading, progress } = useS3Upload({
 onSuccess: (result) => {
 setUploadResult(result)
 setError(null)
 },
 onError: (err) => {
 setError(err.message)
 setUploadResult(null)
 }
 })

 const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0]
 if (file) {
 setSelectedFile(file)
 setError(null)
 setUploadResult(null)
 }
 }

 const handleUpload = async () => {
 if (!selectedFile) return

 const tempTransactionId = `test-${Date.now()}`
 await uploadToS3(selectedFile, {
 type: 'transaction',
 transactionId: tempTransactionId,
 documentType: 'test-upload'
 })
 }

 return (
 <DashboardLayout>
 <div className="max-w-4xl mx-auto p-6">
 <h1 className="text-2xl font-bold mb-6">S3 Upload Test</h1>
 
 <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-4">
 <div>
 <label htmlFor="s3-test-file" className="block text-sm font-medium text-slate-700 mb-2">
 Select a file to test S3 upload
 </label>
 <input
 id="s3-test-file"
 name="testFile"
 type="file"
 onChange={handleFileSelect}
 className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100"
 aria-label="Select a file to test S3 upload functionality"
 aria-describedby="s3-test-file-help"
 />
 <span id="s3-test-file-help" className="sr-only">
 Upload any file to test the S3 integration. Files under 5MB are recommended for testing.
 </span>
 </div>

 {selectedFile && (
 <div className="bg-slate-50 rounded p-4">
 <h3 className="font-medium mb-2">Selected File:</h3>
 <ul className="space-y-1 text-sm">
 <li><strong>Name:</strong> {selectedFile.name}</li>
 <li><strong>Size:</strong> {(selectedFile.size / 1024).toFixed(2)} KB</li>
 <li><strong>Type:</strong> {selectedFile.type}</li>
 </ul>
 </div>
 )}

 <button
 onClick={handleUpload}
 disabled={!selectedFile || isUploading}
 className="px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
 >
 {isUploading ? 'Uploading...' : 'Upload to S3'}
 </button>

 {isUploading && (
 <div className="space-y-2">
 <div className="flex justify-between text-sm">
 <span>Upload Progress</span>
 <span>{progress.percentage}%</span>
 </div>
 <div className="w-full bg-slate-200 rounded-full h-2">
 <div
 className="bg-cyan-600 h-2 rounded-full transition-all"
 style={{ width: `${progress.percentage}%` }}
 />
 </div>
 </div>
 )}

 {error && (
 <div className="bg-red-50 border border-red-200 rounded p-4">
 <h3 className="text-red-800 font-medium mb-1">Upload Error:</h3>
 <p className="text-red-600 text-sm">{error}</p>
 <p className="text-red-600 text-xs mt-2">Check browser console for details</p>
 </div>
 )}

 {uploadResult && (
 <div className="bg-green-50 border border-green-200 rounded p-4">
 <h3 className="text-green-800 font-medium mb-2">Upload Successful!</h3>
 <ul className="space-y-1 text-sm text-green-700">
 <li><strong>S3 Key:</strong> {uploadResult.s3Key}</li>
 <li><strong>File Name:</strong> {uploadResult.fileName}</li>
 <li><strong>File Size:</strong> {uploadResult.fileSize} bytes</li>
 <li><strong>View URL:</strong> <a href={uploadResult.viewUrl} target="_blank" rel="noopener noreferrer" className="underline">View File</a></li>
 </ul>
 </div>
 )}
 </div>

 <div className="mt-6 bg-cyan-50 rounded-lg p-4">
 <h2 className="font-medium text-cyan-900 mb-2">Test Instructions:</h2>
 <ol className="list-decimal list-inside space-y-1 text-sm text-cyan-800">
 <li>Select a file (preferably under 5MB)</li>
 <li>Click "Upload to S3"</li>
 <li>Check browser console for any CORS errors</li>
 <li>If successful, the file will be uploaded and you'll see the S3 details</li>
 <li>Click the "View File" link to verify the file was uploaded correctly</li>
 </ol>
 </div>
 </div>
 </DashboardLayout>
 )
}
