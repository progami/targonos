import { AlertCircle } from '@/lib/lucide-icons'
import Link from 'next/link'

export default function InternalServerError() {
 return (
 <div className="min-h-screen flex items-center justify-center bg-slate-50">
 <div className="max-w-md w-full bg-white dark:bg-slate-800 shadow-lg rounded-lg p-6">
 <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
 <AlertCircle className="w-6 h-6 text-red-600" />
 </div>
 <div className="mt-4 text-center">
 <h1 className="text-2xl font-bold text-slate-900">
 500 - Internal Server Error
 </h1>
 <p className="mt-2 text-sm text-slate-600">
 Something went wrong on our servers. Please try again later.
 </p>
 <div className="mt-6 flex gap-3 justify-center">
 <Link
 href="/"
 className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90"
 >
 Go to Dashboard
 </Link>
 </div>
 </div>
 </div>
 </div>
 )
}