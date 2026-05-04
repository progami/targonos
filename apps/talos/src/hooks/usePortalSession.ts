import { useQuery } from '@tanstack/react-query'
import type { Session } from 'next-auth'
import { withBasePath } from '@/lib/utils/base-path'

type Status = 'loading' | 'authenticated' | 'unauthenticated'

const SESSION_QUERY_KEY = ['portal-session'] as const

export async function parsePortalSessionResponse(response: Response): Promise<Session | null> {
  if (!response.ok) {
    if (response.status === 401) {
      return null
    }

    throw new Error('Failed to fetch session')
  }

  const contentType = response.headers.get('content-type')
  if (typeof contentType !== 'string') {
    return null
  }

  if (!contentType.includes('application/json')) {
    return null
  }

  return response.json()
}

async function fetchSession(): Promise<Session | null> {
  const response = await fetch(withBasePath('/api/portal/session'), {
    credentials: 'include',
    headers: {
      accept: 'application/json',
    },
  })
  return parsePortalSessionResponse(response)
}

export function usePortalSession() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000, // 5 minutes - session data rarely changes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: false, // Don't retry on 401s
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when components mount - use cached data
  })

  const status: Status = isLoading
    ? 'loading'
    : data
      ? 'authenticated'
      : 'unauthenticated'

  const update = async () => {
    await refetch()
  }

  return { data: data ?? null, status, update }
}

// Backwards-compatible alias so other modules can keep calling useSession.
export const useSession = usePortalSession
