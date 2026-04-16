import { withAuth, ApiResponses } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { loadCostLedgerData, parseCostLedgerQuery } from './query'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, _session) => {
 const prisma = await getTenantPrisma()
 const query = parseCostLedgerQuery(request.nextUrl.searchParams)
 const data = await loadCostLedgerData(prisma, query)
 return ApiResponses.success(data)
})
