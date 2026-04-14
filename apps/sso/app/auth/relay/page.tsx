import { redirect } from 'next/navigation'
import RelayClient from './RelayClient'
import { resolvePortalCallbackTarget } from '@/lib/callback-target'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function getFirstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

export default async function AuthRelay({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {}
  const toParam = getFirstString(params.to)
  if (!toParam || toParam.trim().length === 0) {
    redirect('/')
  }

  const baseUrl = process.env.NEXTAUTH_URL
  if (!baseUrl) {
    throw new Error('NEXTAUTH_URL must be defined for /auth/relay.')
  }
  const target = resolvePortalCallbackTarget({
    targetUrl: toParam,
    portalBaseUrl: baseUrl,
  })
  if (!target) {
    redirect('/')
  }

  return <RelayClient to={target} />
}
