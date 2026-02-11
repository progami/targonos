import { withAuth } from '@/lib/api/auth-wrapper'
import { ApiResponses } from '@/lib/api/responses'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  return ApiResponses.badRequest('ERD v9 endpoints are deprecated. Use /api/erd/v10/compliance instead.')
})

