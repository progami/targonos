import { getPublicBasePath } from './base-path'

type JsonErrorPayload = {
  error?: string
}

export function buildAppPath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`Expected absolute app path "${path}".`)
  }

  return `${getPublicBasePath()}${path}`
}

export async function readJsonOrThrow<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('accept', 'application/json')

  const response = await fetch(input, {
    ...init,
    cache: 'no-store',
    headers,
  })
  const contentType = response.headers.get('content-type')
  const text = await response.text()

  if (contentType === null || !contentType.toLowerCase().includes('application/json')) {
    const requestLabel = typeof input === 'string' ? input : input.toString()
    throw new Error(`Expected JSON response for ${requestLabel} but received "${contentType ?? 'unknown'}".`)
  }

  const payload = JSON.parse(text) as T & JsonErrorPayload
  if (!response.ok) {
    if (typeof payload === 'object' && payload !== null && typeof payload.error === 'string') {
      throw new Error(payload.error)
    }

    throw new Error(`Request failed for ${typeof input === 'string' ? input : input.toString()}.`)
  }

  return payload
}

export function readAppJsonOrThrow<T>(path: string, init?: RequestInit): Promise<T> {
  return readJsonOrThrow<T>(buildAppPath(path), init)
}
