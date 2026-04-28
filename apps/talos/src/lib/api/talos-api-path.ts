import { withBasePath } from '@/lib/utils/base-path'

export function buildTalosApiPath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`Talos paths must start with "/": ${path}`)
  }

  if (path === '/api') {
    return withBasePath(path)
  }

  if (path.startsWith('/api/')) {
    return withBasePath(path)
  }

  return path
}
