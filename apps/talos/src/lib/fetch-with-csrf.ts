// Helper to get cookie value
import { withBasePath } from '@/lib/utils/base-path'

function getCookie(name: string): string | null {
 if (typeof document === 'undefined') return null;
 const value = `; ${document.cookie}`;
 const parts = value.split(`; ${name}=`);
 if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
 return null;
}

function normalizeRequestUrl(url: string): string {
 const trimmed = url.trim()
 if (!trimmed) return trimmed
 return trimmed.startsWith('/') ? withBasePath(trimmed) : trimmed
}

// Utility function to make fetch requests with CSRF token
export async function fetchWithCSRF(url: string, options: RequestInit = {}): Promise<Response> {
 const resolvedUrl = normalizeRequestUrl(url)
 const csrfToken = getCookie('csrf-token');
 
 const headers = new Headers(options.headers);
 const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
 if (!isFormData && !headers.has('Content-Type')) {
   headers.set('Content-Type', 'application/json');
 }
 
 if (csrfToken) {
 headers.set('x-csrf-token', csrfToken);
 }
 
 const response = await fetch(resolvedUrl, {
 ...options,
 headers,
 credentials: 'include' // Ensure cookies are sent
 });
 
 // If CSRF token is invalid, try to refresh and retry once
 if (response.status === 403 && response.headers.get('content-type')?.includes('application/json')) {
 try {
 const data = await response.clone().json();
 if (data.error === 'Invalid CSRF token') {
  // Get a new CSRF token by making a GET request
  await fetch(withBasePath('/api/csrf'), { credentials: 'include' });
 
 // Retry the original request with the new token
 const newCsrfToken = getCookie('csrf-token');
 if (newCsrfToken && newCsrfToken !== csrfToken) {
 headers.set('x-csrf-token', newCsrfToken);
 return fetch(resolvedUrl, {
 ...options,
 headers,
 credentials: 'include'
 });
 }
 }
 } catch {
 // If JSON parsing fails, just return the original response
 }
 }
 
 return response;
}
