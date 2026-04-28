import { buildTalosApiPath } from '@/lib/api/talos-api-path'

const rootApiPath = '/api'
const rootApiPrefix = `${rootApiPath}/`
const talosApiPath = '/talos/api'
const talosApiPrefix = `${talosApiPath}/`

function isRootApiPath(pathname: string): boolean {
 if (pathname === rootApiPath) return true
 return pathname.startsWith(rootApiPrefix)
}

function isTalosApiPath(pathname: string): boolean {
 if (pathname === talosApiPath) return true
 return pathname.startsWith(talosApiPrefix)
}

function isJsonContentType(contentType: string): boolean {
 const lowerContentType = contentType.toLowerCase()
 if (lowerContentType.includes('application/json')) return true
 return lowerContentType.includes('+json')
}

function guardJsonResponse(response: Response, requestPath: string): Response {
 const originalJson = response.json.bind(response)
 Object.defineProperty(response, 'json', {
 configurable: true,
 value: async () => {
  const contentType = response.headers.get('content-type')?.trim() ?? ''
  if (!isJsonContentType(contentType)) {
   const received = contentType === '' ? 'no content-type' : contentType
   throw new Error(`Talos API expected JSON but received ${received} from ${requestPath} (${response.status})`)
  }
  return originalJson()
 },
 })
 return response
}

type FetchWithBasePathMarker = typeof globalThis.fetch & { __withBasePath?: boolean }

function patchGlobalFetch() {
 if (typeof globalThis.fetch !== 'function') return
 const originalFetch = globalThis.fetch as FetchWithBasePathMarker

 if (originalFetch.__withBasePath) {
 return
 }

 const patched = async function (input: RequestInfo | URL, init?: RequestInit) {
 let apiRequestPath: string | null = null

 if (typeof input === 'string') {
  if (isRootApiPath(input)) {
   input = buildTalosApiPath(input)
   apiRequestPath = input
  } else if (isTalosApiPath(input)) {
   apiRequestPath = input
  }
 } else if (input instanceof URL) {
  if (isRootApiPath(input.pathname)) {
   const resolvedPath = buildTalosApiPath(input.pathname)
   input = new URL(resolvedPath + input.search + input.hash, input.origin)
   apiRequestPath = `${resolvedPath}${input.search}`
  } else if (isTalosApiPath(input.pathname)) {
   apiRequestPath = `${input.pathname}${input.search}`
  }
 }

 const response = await originalFetch.call(this, input, init)
 return apiRequestPath ? guardJsonResponse(response, apiRequestPath) : response
 } as FetchWithBasePathMarker

 patched.__withBasePath = true
 globalThis.fetch = patched
}

patchGlobalFetch()

export {}
