'use client'

import { useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { AlertTriangle, Home } from '@/lib/lucide-icons'
import Link from 'next/link'

export default function Error({
 error,
 reset,
}: {
 error: Error & { digest?: string }
 reset: () => void
}) {
 useEffect(() => {
 // Log the error to console in development
 console.error('Application error:', error)
 }, [error])

 return (
 <DashboardLayout>
 <div className="flex min-h-[400px] items-center justify-center">
 <div className="text-center space-y-6 max-w-md">
 <div className="flex justify-center">
 <div className="rounded-full bg-amber-100 p-4">
 <AlertTriangle className="h-12 w-12 text-amber-600" />
 </div>
 </div>
 
 <div className="space-y-2">
 <h1 className="text-2xl font-bold">Something went wrong!</h1>
 <p className="text-muted-foreground">
 An unexpected error occurred while processing your request.
 </p>
 {error.message && (
 <p className="text-sm text-slate-600 mt-2 p-3 bg-slate-100 rounded">
 {error.message}
 </p>
 )}
 </div>
 
 <div className="flex items-center justify-center gap-4">
	 <button
	 onClick={reset}
	 className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-md shadow-soft text-sm font-medium text-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50"
	 >
	 Try Again
	 </button>
 <Link
 href="/dashboard"
 className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-soft text-sm font-medium text-white bg-primary hover:bg-primary/90"
 >
 <Home className="h-4 w-4 mr-2" />
 Go to Dashboard
 </Link>
 </div>
 </div>
 </div>
 </DashboardLayout>
 )
}
