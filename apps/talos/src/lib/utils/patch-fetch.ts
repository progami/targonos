import { buildTalosApiPath } from '@/lib/api/talos-api-path'

function shouldPrefix(input: RequestInfo | URL): input is string {
 return typeof input === 'string' && input.startsWith('/api/')
}

type FetchWithBasePathMarker = typeof globalThis.fetch & { __withBasePath?: boolean }

function patchGlobalFetch() {
 if (typeof globalThis.fetch !== 'function') return
 const originalFetch = globalThis.fetch as FetchWithBasePathMarker

 if (originalFetch.__withBasePath) {
 return
 }

 const patched = function (input: RequestInfo | URL, init?: RequestInit) {
 if (shouldPrefix(input)) {
 input = buildTalosApiPath(input)
 } else if (input instanceof URL) {
 if (input.pathname.startsWith('/api/')) {
 input = new URL(buildTalosApiPath(input.pathname) + input.search + input.hash, input.origin)
 }
 }
 return originalFetch.call(this, input, init)
 } as FetchWithBasePathMarker

 patched.__withBasePath = true
 globalThis.fetch = patched
}

patchGlobalFetch()

export {}
