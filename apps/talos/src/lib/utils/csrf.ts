/**
 * CSRF Token Management Utilities
 */

import { buildTalosApiPath } from '@/lib/api/talos-api-path'
export { fetchWithCSRF } from '@/lib/fetch-with-csrf'

const CSRF_COOKIE_NAME = 'csrf-token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Get CSRF token from cookies
 */
export function getCSRFToken(): string | null {
 if (typeof window === 'undefined') {
 return null
 }
 
 const match = document.cookie.match(new RegExp(`(^| )${CSRF_COOKIE_NAME}=([^;]+)`))
 return match ? match[2] : null
}

/**
 * Add CSRF token to fetch headers
 */
export function addCSRFHeader(headers: HeadersInit = {}): HeadersInit {
 const token = getCSRFToken()
 if (!token) {
 // In development, we might not have a token yet
 // console.warn('No CSRF token found in cookies')
 return headers
 }
 
 const headerObj = headers instanceof Headers ? headers : new Headers(headers)
 headerObj.set(CSRF_HEADER_NAME, token)
 
 return headerObj
}

/**
 * Request a new CSRF token from the server
 * This should be called on page load or when a token expires
 */
export async function refreshCSRFToken(): Promise<void> {
 try {
 // Make a GET request to any API endpoint to get a fresh CSRF token
 // The server will set the token cookie in the response
 await fetch(buildTalosApiPath('/api/csrf'), {
 method: 'GET',
 credentials: 'include'
 })
 } catch (_error) {
 // console.error('Failed to refresh CSRF token:', _error)
 }
}
