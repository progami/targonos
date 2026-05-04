'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from '@/lib/lucide-icons'
import { buildAppCallbackUrl, redirectToPortal } from '@/lib/portal'

const errorMessages: Record<string, string> = {
 Configuration: 'There is a problem with the server configuration.',
 AccessDenied: 'You do not have permission to sign in.',
 Verification: 'The sign in link is no longer valid. It may have been used already or it may have expired.',
 OAuthSignin: 'Error in constructing an authorization URL.',
 OAuthCallback: 'Error in handling the response from the OAuth provider.',
 OAuthCreateAccount: 'Could not create OAuth provider user in the database.',
 EmailCreateAccount: 'Could not create email provider user in the database.',
 Callback: 'Error in the OAuth callback handler route.',
 OAuthAccountNotLinked: 'The email on the account is already linked, but not with this OAuth account.',
 EmailSignin: 'Sending the email with the verification token failed.',
 SessionRequired: 'Please sign in to access this page.',
 SessionExpired: 'Your session has expired. Please sign in again.',
 Default: 'An error occurred during authentication.',
}

function AuthErrorContent() {
 const searchParams = useSearchParams()
 const error = searchParams.get('error')
 
 const errorMessage = error && errorMessages[error] 
 ? errorMessages[error] 
 : errorMessages.Default

 const handleRetry = () => {
 redirectToPortal('/login', buildAppCallbackUrl('/auth/error'))
 }

 return (
 <div className="flex min-h-screen items-center justify-center px-4">
 <Card className="w-full max-w-md">
 <CardHeader className="text-center">
 <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
 <AlertCircle className="h-6 w-6 text-red-600" />
 </div>
 <CardTitle className="text-2xl">Authentication Error</CardTitle>
 <CardDescription className="mt-2">
 {errorMessage}
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {error && (
 <div className="rounded-md bg-slate-50 p-3 text-center">
 <p className="text-sm text-slate-600">
 Error code: <span className="font-mono text-xs">{error}</span>
 </p>
 </div>
 )}
 <Button 
 onClick={handleRetry}
 className="w-full"
 >
 Try Again
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 )
}

export default function AuthError() {
 return (
 <Suspense fallback={
 <div className="flex min-h-screen items-center justify-center px-4">
 <Card className="w-full max-w-md">
 <CardHeader className="text-center">
 <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
 <AlertCircle className="h-6 w-6 text-slate-400" />
 </div>
 <CardTitle className="text-2xl">Loading...</CardTitle>
 </CardHeader>
 </Card>
 </div>
 }>
 <AuthErrorContent />
 </Suspense>
 )
}
