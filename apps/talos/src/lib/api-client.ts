import { buildTalosApiPath } from '@/lib/api/talos-api-path'

interface FetchOptions extends RequestInit {
 skipBaseAuth?: boolean
}

/**
 * Wrapper around fetch for API routes
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns Promise with the fetch response
 */
export async function apiFetch(url: string, options?: FetchOptions): Promise<Response> {
 const finalUrl = url.startsWith('/') ? buildTalosApiPath(url) : url
 return fetch(finalUrl, options)
}

/**
 * Convenience method for GET requests
 */
export async function apiGet(url: string, options?: FetchOptions): Promise<Response> {
 return apiFetch(url, { ...options, method: 'GET' })
}

/**
 * Convenience method for POST requests
 */
export async function apiPost(url: string, body?: unknown, options?: FetchOptions): Promise<Response> {
 return apiFetch(url, {
 ...options,
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...options?.headers,
 },
 body: body ? JSON.stringify(body) : undefined,
 })
}

/**
 * Convenience method for PUT requests
 */
export async function apiPut(url: string, body?: unknown, options?: FetchOptions): Promise<Response> {
 return apiFetch(url, {
 ...options,
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 ...options?.headers,
 },
 body: body ? JSON.stringify(body) : undefined,
 })
}

/**
 * Convenience method for DELETE requests
 */
export async function apiDelete(url: string, options?: FetchOptions): Promise<Response> {
 return apiFetch(url, { ...options, method: 'DELETE' })
}
